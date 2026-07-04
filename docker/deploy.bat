@echo off
setlocal

echo ========================================
echo   房屋征收调查系统 - Docker部署脚本
echo ========================================
echo.

cd /d "%~dp0"

if not exist .env (
    echo [信息] 未找到 .env 文件，正在从 .env.example 复制...
    copy .env.example .env
    echo.
    echo [注意] 请先修改 .env 文件中的配置，特别是密码设置
    echo        修改完成后重新运行此脚本
    echo.
    pause
    exit /b 1
)

echo [1/4] 拉取最新代码...
cd ..
git pull
if errorlevel 1 (
    echo [警告] Git pull 失败，使用当前代码继续
)
cd docker

echo.
echo [2/4] 构建并启动服务...
docker-compose up -d --build

echo.
echo [3/4] 等待数据库初始化...
timeout /t 15 /nobreak >nul

echo.
echo [4/4] 部署完成！
echo.
echo ========================================
echo   访问地址: http://localhost:3000
echo   默认管理员: admin / admin123
echo ========================================
echo.
echo 常用命令:
echo   查看日志: docker-compose logs -f
echo   停止服务: docker-compose down
echo   重启服务: docker-compose restart
echo.
pause
