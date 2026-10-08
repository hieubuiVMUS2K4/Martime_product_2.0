import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { FileText, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import DailyNoonReportForm from './DailyNoonReportForm';
import WeeklyReportForm from './WeeklyReport';
import MonthlyReportForm from './MonthlyReport';

/**
 * Unified Reporting Interface
 * Tích hợp Daily/Weekly/Monthly Reports với Tab Navigation
 */
const UnifiedReportingForm: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  return (
    <div className="w-full px-[1.5%] py-4">
      <Card className="shadow-lg">
        <CardHeader className="border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <CardTitle className="flex items-center gap-3 text-2xl">
            <FileText className="w-7 h-7" />
            Maritime Reporting System
          </CardTitle>
          <p className="text-blue-100 text-sm mt-1">
            SOLAS V / MARPOL Annex VI Compliant Reporting
          </p>
        </CardHeader>

        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            {/* Tab Navigation - Compact & Clean */}
            <TabsList className="grid w-full grid-cols-3 mb-6 h-auto p-1 bg-gray-100">
              <TabsTrigger 
                value="daily" 
                className="flex items-center gap-2 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <FileText className="w-4 h-4" />
                <span className="font-medium">Daily Report</span>
              </TabsTrigger>
              <TabsTrigger 
                value="weekly" 
                className="flex items-center gap-2 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Calendar className="w-4 h-4" />
                <span className="font-medium">Weekly Summary</span>
              </TabsTrigger>
              <TabsTrigger 
                value="monthly" 
                className="flex items-center gap-2 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <TrendingUp className="w-4 h-4" />
                <span className="font-medium">Monthly Summary</span>
              </TabsTrigger>
            </TabsList>

            {/* Daily Report Form */}
            <TabsContent value="daily" className="mt-0">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <strong>Noon Report (Daily)</strong> - Submit at 12:00 LT. Records position, fuel consumption, weather, and vessel performance for the past 24 hours.
                </div>
              </div>
              <DailyNoonReportForm />
            </TabsContent>

            {/* Weekly Report Form */}
            <TabsContent value="weekly" className="mt-0">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-800">
                  <strong>Weekly Performance Report</strong> - Auto-aggregates 7 daily noon reports. Includes fuel efficiency, maintenance hours, port calls, and KPIs.
                </div>
              </div>
              <WeeklyReportForm />
            </TabsContent>

            {/* Monthly Report Form */}
            <TabsContent value="monthly" className="mt-0">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-purple-800">
                  <strong>Monthly Summary Report</strong> - Comprehensive monthly operations summary. Aggregates all reports (noon, departure, arrival, bunker) with compliance metrics.
                </div>
              </div>
              <MonthlyReportForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default UnifiedReportingForm;
