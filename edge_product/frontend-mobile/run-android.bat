@echo off
setlocal
REM Chay app tren MAY AO ANDROID (khong can Visual Studio).
REM   run-android.bat   bat may ao (neu chua chay), sinh code, chay app voi hot reload (r = reload, R = restart, q = thoat)
REM May ao: Maritime_Pixel7 (Android 15) - du lieu o D:\dev\android\avd
REM App goi backend tau qua http://10.0.2.2:5001 (= localhost:5001 cua may tinh) - nho bat edge-services truoc.
cd /d "%~dp0"

set "ANDROID_HOME=D:\dev\android\sdk"
set "ANDROID_AVD_HOME=D:\dev\android\avd"
set "ADB=%ANDROID_HOME%\platform-tools\adb.exe"
set "AVD=Maritime_Pixel7"

REM 1) Bat may ao neu chua co thiet bi Android nao
"%ADB%" get-state 1>nul 2>nul
if not errorlevel 1 goto ready
echo Dang bat may ao %AVD% ...
start "Android Emulator" "%ANDROID_HOME%\emulator\emulator.exe" -avd %AVD% -no-boot-anim
"%ADB%" wait-for-device

:waitboot
set "BOOT="
for /f "delims=" %%b in ('"%ADB%" shell getprop sys.boot_completed 2^>nul') do set "BOOT=%%b"
if "%BOOT%"=="1" goto ready
timeout /t 3 /nobreak >nul
goto waitboot

:ready
echo May ao Android da san sang.

REM 2) Thu vien + sinh code (retrofit/json: cac file *.g.dart khong nam trong git)
call flutter pub get
call dart run build_runner build --delete-conflicting-outputs

REM 3) Chay app tren thiet bi Android dau tien (may ao)
set "DEVICE="
for /f "skip=1 tokens=1,2" %%a in ('"%ADB%" devices') do (
  if "%%b"=="device" if not defined DEVICE set "DEVICE=%%a"
)
if not defined DEVICE (
  echo Khong tim thay thiet bi Android.
  exit /b 1
)
call flutter run -d %DEVICE%
endlocal
