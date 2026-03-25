@echo off
echo [1/3] Generating icon...
python create_icon.py
if errorlevel 1 (echo Icon generation failed & exit /b 1)

echo [2/3] Building executable...
pyinstaller ^
  --onefile ^
  --windowed ^
  --icon=icon.ico ^
  --name="paulus-shuffle" ^
  --add-data "icon.png;." ^
  gui.py
if errorlevel 1 (echo Build failed & exit /b 1)

echo [3/3] Done! Executable is at dist\paulus-shuffle.exe
