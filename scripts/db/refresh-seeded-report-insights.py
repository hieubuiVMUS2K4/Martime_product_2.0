"""Run on Shore through SSH. Repairs failed fixture insights using the configured AI service."""
import json, subprocess, time, sys
from concurrent.futures import ThreadPoolExecutor

DB = 'production-postgres-1'
def sql(statement):
    return subprocess.check_output(['docker','exec','-i',DB,'sh','-c',
        'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'], input=statement.encode()).decode().strip()
def quote(value):
    return "'" + str(value).replace("'", "''") + "'"
config = json.loads(subprocess.check_output(['docker','exec','production-backend-1','cat','/app/appsettings.json']))
env = dict(item.split('=',1) for item in json.loads(subprocess.check_output(['docker','inspect','production-backend-1']))[0]['Config']['Env'] if '=' in item)
keys = (env.get('Groq__ApiKey') or config.get('Groq',{}).get('ApiKey') or config.get('Gemini',{}).get('ApiKey','')).split(',')
model = env.get('Groq__Model') or config.get('Groq',{}).get('Model') or 'openai/gpt-oss-120b'
reports = json.loads(sql('''SELECT coalesce(json_agg(x),'[]') FROM (
 SELECT n.*, m."OriginNode" FROM noon_reports n JOIN maritime_reports m ON m."Id"=n."MaritimeReportId"
 JOIN report_seed_registry s ON s.report_id=m."Id" WHERE s.seed_key LIKE '[SEED:reports-20261114:%'
 ORDER BY n."ReportDate" DESC) x;'''))
failed = set(json.loads(sql('''SELECT coalesce(json_agg(DISTINCT "ReportId"),'[]') FROM "ReportEvaluations"
 WHERE "ContentVi" ILIKE '%Lỗi gọi%API%' OR "Status"='Unavailable';''')))
pending = [r for r in reports if '--all' in sys.argv or r['Id'] in failed]
print(json.dumps({'reports':len(reports),'failed':len(pending)}),flush=True)

def repair(report):
    history = [r for r in reports if r['OriginNode']==report['OriginNode'] and
        0 < (time.mktime(time.strptime(report['ReportDate'][:10],'%Y-%m-%d')) - time.mktime(time.strptime(r['ReportDate'][:10],'%Y-%m-%d'))) <= 7*86400]
    fields = {'SeaTemperature':'SeaTemperature','FuelConsumption':'FuelOilConsumed','Rpm':'MainEngineRPM','Speed':'SpeedOverGround'}
    current = {k:report.get(v) for k,v in fields.items()}
    current['ReportDate']=report['ReportDate']
    averages = {'Avg'+k:sum((r.get(v) or 0) for r in history)/len(history) if history else None for k,v in fields.items()}
    data={'CurrentReport':current,'Past7DaysAverage':averages,'DetailedHistoryCount':len(history),
          'OperationalContext':report.get('OperationalRemarks'),
          'Units':{'SeaTemperature':'deg C','FuelConsumption':'MT per reporting day','Rpm':'rpm','Speed':'knots'}}
    prompt = ('Đánh giá báo cáo hiện tại so với 7 ngày trước, chỉ dùng số liệu JSON dưới đây. '
        'SeaTemperature là nhiệt độ nước biển, không phải động cơ. RPM/tốc độ 0 có thể là ở cảng. '
        'Không suy đoán hỏng máy hay chứng nhận an toàn khi thiếu cảm biến. Nếu không có lịch sử hãy nói rõ. '
        'FuelConsumption là MT/ngày báo cáo, không phải lít/giờ. Dùng đúng đơn vị Units. '
        'Xem OperationalContext để phân biệt ở cảng/chạy biển; trung bình gồm cả hai chế độ. Không coi ở cảng là bất thường. '
        'Trả JSON gồm status (Normal/Warning/Critical), contentVi (tiếng Việt khoảng 100 chữ).\n'+json.dumps(data))
    payload={'model':model,'messages':[{'role':'user','content':prompt}], 'max_completion_tokens':2048,'response_format':{'type':'json_object'}}
    if model.startswith('openai/gpt-oss-'): payload['reasoning_effort']='low'
    for attempt in range(7):
        key=keys[attempt%len(keys)].strip()
        settings='url = "https://api.groq.com/openai/v1/chat/completions"\nheader = "Authorization: Bearer '+key+'"\nheader = "Content-Type: application/json"\nmax-time = 35\n'
        response=subprocess.run(['curl','-sS','--config','-','--data',json.dumps(payload)],input=settings,text=True,capture_output=True)
        try:
            body=json.loads(response.stdout)
            if 'error' in body:
                if body['error'].get('code') in ('rate_limit_exceeded',):
                    time.sleep(12*(attempt+1)); continue
                raise ValueError('AI service rejected request')
            result=json.loads(body['choices'][0]['message']['content'])
            assert result['status'] in ('Normal','Warning','Critical') and len(result['contentVi'])>40
            assert 'demo' not in result['contentVi'].lower()
            sql('BEGIN; UPDATE "ReportEvaluations" SET "Status"='+quote(result['status'])+', "ContentVi"='+quote(result['contentVi'])+', "CreatedDate"=now() WHERE "ReportId"='+quote(report['Id'])+'; COMMIT;')
            return True
        except (ValueError,KeyError,AssertionError,IndexError):
            time.sleep(5*(attempt+1))
    return False

success=0
# Bound concurrency and retry rate-limit responses without overloading the server.
with ThreadPoolExecutor(max_workers=2) as pool:
    for i,ok in enumerate(pool.map(repair,pending)):
        success += int(ok)
        print(json.dumps({'processed':i+1,'repaired':success,'total':len(pending)}),flush=True)
print(json.dumps({'completed':success,'remaining':len(pending)-success}),flush=True)
