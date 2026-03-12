@echo off
set "CURSOR_AGENT_BIN=%~dp0agent-wrapper.cmd"
set "CURSOR_AGENT_NODE=%~dp0..\..\..\bin\node.exe"
set "CURSOR_AGENT_SCRIPT=%~dp0..\..\..\bin\index.js"
set "CURSOR_BRIDGE_SESSIONS_LOG=%~dp0sessions.log"
set "CURSOR_BRIDGE_MODE=agent"
set "CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE=false"
set "CURSOR_BRIDGE_FORCE=true"
if not defined NODE_COMPILE_CACHE set "NODE_COMPILE_CACHE=%LOCALAPPDATA%\cursor-compile-cache"
cd /d "%~dp0"
node ./dist/cli.js %*
