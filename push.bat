@echo off
chcp 65001 >nul
setlocal

echo ========================================
echo   房屋征收调查系统 - 一键推送更新
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] 检查变更...
git status --short
echo.

echo [2/4] 添加所有变更...
git add -A
echo.

echo [3/4] 提交变更...
set /p commit_msg="请输入提交说明(直接回车使用默认): "
if "%commit_msg%"=="" set commit_msg=update: 更新代码 %date% %time%
git commit -m "%commit_msg%"
echo.

echo [4/4] 推送到 GitHub...
git push origin main
echo.

if %errorlevel%==0 (
    echo ========================================
    echo   ✅ 推送成功！
    echo   仓库地址: https://github.com/whgxr/zscx
    echo ========================================
) else (
    echo ========================================
    echo   ❌ 推送失败，请检查错误信息
    echo ========================================
)

echo.
pause
