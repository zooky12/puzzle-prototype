@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

REM --- This batch should be inside the "levels" folder ---
pushd "%~dp0" >nul 2>&1

set "TMPFILE=%TEMP%\worlds.tmp"
set "UPDATED="

REM ---------------------------------------------------------
REM 1) Generate worlds.json (list of subfolders)
REM ---------------------------------------------------------
> "%TMPFILE%" echo [
set "first=1"
for /f "delims=" %%D in ('dir /b /ad') do (
  if defined first (
    >>"%TMPFILE%" echo   "%%~nD"
    set "first="
  ) else (
    >>"%TMPFILE%" echo   ,"%%~nD"
  )
)
>>"%TMPFILE%" echo ]

call :writeIfChanged "%TMPFILE%" "worlds.json"

REM ---------------------------------------------------------
REM 2) Generate index.json for each world
REM ---------------------------------------------------------
for /f "delims=" %%D in ('dir /b /ad') do (
  set "W=%%D"
  set "IDX=%TEMP%\index_%%D.tmp"
  > "!IDX!" echo [
  set "firstFile=1"
  for /f "delims=" %%F in ('dir /b /a-d "%%D\*.json" 2^>nul ^| findstr /i /v "^index\.json$"') do (
    if defined firstFile (
      >>"!IDX!" echo   "%%F"
      set "firstFile="
    ) else (
      >>"!IDX!" echo   ,"%%F"
    )
  )
  >>"!IDX!" echo ]
  call :writeIfChanged "!IDX!" "%%D\index.json"
)

echo.
if defined UPDATED (
  echo Updated files:
  for %%X in (!UPDATED!) do echo  - %%~X
) else (
  echo Everything up to date.
)

popd >nul
exit /b


REM ---------------------------------------------------------
REM Function: writeIfChanged [tempfile] [target]
REM ---------------------------------------------------------
:writeIfChanged
setlocal
set "TMP=%~1"
set "DEST=%~2"
if not exist "%DEST%" (
  copy /y "%TMP%" "%DEST%" >nul
  endlocal & set "UPDATED=!UPDATED! %DEST!" & exit /b
)
fc /b "%TMP%" "%DEST%" >nul
if errorlevel 1 (
  copy /y "%TMP%" "%DEST%" >nul
  endlocal & set "UPDATED=!UPDATED! %DEST!" & exit /b
)
endlocal
exit /b
