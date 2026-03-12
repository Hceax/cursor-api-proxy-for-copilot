@echo off
set "CURSOR_INVOKED_AS=agent.cmd"
if not defined NODE_COMPILE_CACHE set "NODE_COMPILE_CACHE=%LOCALAPPDATA%\cursor-compile-cache"
"%~dp0..\..\..\bin\node.exe" "%~dp0..\..\..\bin\index.js" %*
