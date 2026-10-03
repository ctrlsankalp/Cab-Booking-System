@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Building Cab Booking System C++ Backend
echo ========================================

where g++ >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Compiling with g++...
    g++ -std=c++17 -O2 -Wall -o cab_app.exe main.cpp cab_management.cpp real_map_logic.cpp
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Compilation failed.
        exit /b %ERRORLEVEL%
    )
    echo [SUCCESS] cab_app.exe successfully generated!
    goto run_check
)

where cl >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Compiling with MSVC cl...
    cl /EHsc /std:c++17 /O2 /Fe:cab_app.exe main.cpp cab_management.cpp real_map_logic.cpp
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Compilation failed.
        exit /b %ERRORLEVEL%
    )
    echo [SUCCESS] cab_app.exe successfully generated!
    goto run_check
)

echo [ERROR] No compatible C++ compiler found (g++ or cl). Please install MinGW or MSVC.
exit /b 1

:run_check
if "%1"=="run" (
    echo.
    echo Running cab_app.exe:
    echo ----------------------------------------
    .\cab_app.exe
)
