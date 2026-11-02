@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Zainstaluj Node.js 24.17 lub nowszy. & pause & exit /b 1)
if not exist ".env" copy ".env.example" ".env" >nul
echo Uzupelnij konfiguracje w pliku .env!
call npm install
if errorlevel 1 (echo Blad npm install. & pause & exit /b 1)
echo Po uzupelnieniu .env uruchom: npm run deploy
pause
