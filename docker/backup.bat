@echo off
setlocal

cd /d "%~dp0"

set ENV_FILE=.env
set BACKUP_DIR=backups
set DATE=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set DATE=%DATE: =0%

echo ========================================
echo   房屋征收调查系统 - 数据备份脚本
echo ========================================
echo.

if not exist "%ENV_FILE%" (
    echo [错误] 未找到 .env 配置文件
    echo 请先复制 .env.example 为 .env 并配置
    echo.
    pause
    exit /b 1
)

for /f "tokens=1,2 delims==" %%a in ('type "%ENV_FILE%" ^| findstr /v "^#" ^| findstr /v "^$"') do (
    if "%%a"=="MYSQL_ROOT_PASSWORD" set MYSQL_ROOT_PASSWORD=%%b
    if "%%a"=="MYSQL_DATABASE" set MYSQL_DATABASE=%%b
)

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo [1/2] 备份数据库...
set DB_BACKUP_FILE=%BACKUP_DIR%\zscx_db_%DATE%.sql.gz
docker exec zscx-mysql mysqldump -u root -p%MYSQL_ROOT_PASSWORD% --databases %MYSQL_DATABASE% --single-transaction --routines --triggers --quick | gzip > "%DB_BACKUP_FILE%"
if errorlevel 1 (
    echo [警告] gzip 不可用，保存为未压缩的 SQL 文件
    set DB_BACKUP_FILE=%BACKUP_DIR%\zscx_db_%DATE%.sql
    docker exec zscx-mysql mysqldump -u root -p%MYSQL_ROOT_PASSWORD% --databases %MYSQL_DATABASE% --single-transaction --routines --triggers --quick > "%DB_BACKUP_FILE%"
)
echo   数据库备份完成: %DB_BACKUP_FILE%

echo.
echo [2/2] 备份上传文件...
set UPLOAD_BACKUP_FILE=%BACKUP_DIR%\zscx_uploads_%DATE%.tar.gz
docker run --rm -v zscx_uploads:/data -v "%cd%\%BACKUP_DIR%":/backup alpine tar czf "/backup/zscx_uploads_%DATE%.tar.gz" -C /data .
echo   上传文件备份完成: %UPLOAD_BACKUP_FILE%

echo.
echo ========================================
echo   备份完成！
echo ========================================
echo.
echo 备份文件位置: %BACKUP_DIR%
echo   - 数据库: zscx_db_%DATE%.sql.gz
echo   - 上传文件: zscx_uploads_%DATE%.tar.gz
echo.
echo 备份文件大小:
for %%f in ("%DB_BACKUP_FILE%") do echo   数据库: %%~zf 字节
for %%f in ("%UPLOAD_BACKUP_FILE%") do echo   上传文件: %%~zf 字节
echo.
pause
