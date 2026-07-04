@echo off
setlocal

cd /d "%~dp0"

set ENV_FILE=.env
set BACKUP_DIR=backups

echo ========================================
echo   房屋征收调查系统 - 数据恢复脚本
echo ========================================
echo.

if not exist "%ENV_FILE%" (
    echo [错误] 未找到 .env 配置文件
    pause
    exit /b 1
)

for /f "tokens=1,2 delims==" %%a in ('type "%ENV_FILE%" ^| findstr /v "^#" ^| findstr /v "^$"') do (
    if "%%a"=="MYSQL_ROOT_PASSWORD" set MYSQL_ROOT_PASSWORD=%%b
    if "%%a"=="MYSQL_DATABASE" set MYSQL_DATABASE=%%b
)

echo ⚠️  警告：此操作将覆盖当前数据库和上传文件！
echo.
echo 请选择要恢复的备份类型：
echo   1) 仅恢复数据库
echo   2) 仅恢复上传文件
echo   3) 恢复数据库和上传文件
echo   0) 取消
echo.
set /p choice=请输入选项 [0-3]: 

if "%choice%"=="0" (
    echo 已取消
    pause
    exit /b 0
)
if "%choice%"=="" (
    echo 已取消
    pause
    exit /b 0
)

if not exist "%BACKUP_DIR%" (
    echo [错误] 备份目录不存在: %BACKUP_DIR%
    pause
    exit /b 1
)

echo.
echo 可用的备份文件：
echo.

if "%choice%"=="1" goto db_restore_list
if "%choice%"=="3" goto db_restore_list
goto upload_restore_list

:db_restore_list
echo 数据库备份：
dir /b /o-d "%BACKUP_DIR%\zscx_db_*.sql*" 2>nul | findstr /n "^" || echo   （无）
echo.

:upload_restore_list
if "%choice%"=="2" (
    echo 上传文件备份：
    dir /b /o-d "%BACKUP_DIR%\zscx_uploads_*.tar.gz" 2>nul | findstr /n "^" || echo   （无）
    echo.
)
if "%choice%"=="3" (
    echo 上传文件备份：
    dir /b /o-d "%BACKUP_DIR%\zscx_uploads_*.tar.gz" 2>nul | findstr /n "^" || echo   （无）
    echo.
)

if "%choice%"=="1" set /p db_backup=请输入数据库备份文件名（在 backups 目录下）: 
if "%choice%"=="3" set /p db_backup=请输入数据库备份文件名（在 backups 目录下）: 
if "%choice%"=="2" set /p upload_backup=请输入上传文件备份文件名（在 backups 目录下）: 
if "%choice%"=="3" set /p upload_backup=请输入上传文件备份文件名（在 backups 目录下）: 

echo.
set /p confirm=⚠️  确认要恢复吗？此操作不可撤销！(y/N): 
if /i not "%confirm%"=="y" (
    echo 已取消
    pause
    exit /b 0
)

echo.

if "%choice%"=="1" goto restore_db
if "%choice%"=="3" goto restore_db
goto restore_upload

:restore_db
echo [恢复数据库]
echo   停止 Web 服务...
docker compose stop web 2>nul

echo   恢复数据...
set DB_FILE=%BACKUP_DIR%\%db_backup%
if not exist "%DB_FILE%" (
    echo [错误] 文件不存在: %DB_FILE%
    pause
    exit /b 1
)

echo %db_backup% | findstr /i ".gz" >nul
if %errorlevel%==0 (
    echo   使用压缩备份恢复...
    gzip -d -c "%DB_FILE%" | docker exec -i zscx-mysql mysql -u root -p%MYSQL_ROOT_PASSWORD%
) else (
    docker exec -i zscx-mysql mysql -u root -p%MYSQL_ROOT_PASSWORD% < "%DB_FILE%"
)

echo   启动 Web 服务...
docker compose start web 2>nul
echo   数据库恢复完成
echo.
if "%choice%"=="1" goto done

:restore_upload
echo [恢复上传文件]
echo   停止 Web 服务...
docker compose stop web 2>nul

echo   恢复文件...
set UPLOAD_FILE=%BACKUP_DIR%\%upload_backup%
if not exist "%UPLOAD_FILE%" (
    echo [错误] 文件不存在: %UPLOAD_FILE%
    pause
    exit /b 1
)

docker run --rm -v zscx_uploads:/data -v "%cd%\%UPLOAD_FILE%":/backup.tar.gz alpine sh -c "rm -rf /data/* && tar xzf /backup.tar.gz -C /data"

echo   启动 Web 服务...
docker compose start web 2>nul
echo   上传文件恢复完成
echo.

:done
echo ========================================
echo   恢复完成！
echo ========================================
echo.
pause
