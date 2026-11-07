@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
set "LOG=%~dp0innovatex-startup.log"

echo InnovateX startup log > "%LOG%"
echo Project folder: %~dp0>> "%LOG%"
echo.>> "%LOG%"

echo Checking Node and npm...
node --version >> "%LOG%" 2>&1
npm.cmd --version >> "%LOG%" 2>&1
if errorlevel 1 goto npm_error

echo Installing or repairing dependencies...
npm.cmd install --no-audit --no-fund >> "%LOG%" 2>&1
if errorlevel 1 goto install_error

echo Checking MongoDB Atlas (connection details are never logged)...
npm.cmd run db:check >> "%LOG%" 2>&1
if errorlevel 1 goto database_demo_mode

goto server_start

:database_demo_mode
echo MongoDB is not reachable yet. Starting the site in browser demo mode.
echo The web page will open, but database-backed sign-in and saves need a working Atlas connection.
echo.

:server_start
echo Starting InnovateX in a separate window. Keep the server window open.
echo The browser will open at http://localhost:4173.
echo.>> "%LOG%"
start "InnovateX Server" /D "%~dp0" cmd /k "npm.cmd start"
timeout /t 7 /nobreak >nul
start "" "http://localhost:4173"
echo You can close this launcher window. Close the InnovateX Server window to stop the app.
pause
exit /b 0

:npm_error
echo Node/npm could not be run. See startup log: %LOG%
type "%LOG%"
pause
exit /b 1

:install_error
echo Dependency installation failed. See startup log: %LOG%
type "%LOG%"
pause
exit /b 1

