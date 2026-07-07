import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

print("=== 创建修复脚本 ===")
cmd = """cat > /tmp/fix_pdf.js << 'EOF'
const fs = require('fs');
const path = require('path');

const routePath = '/app/.next/server/app/api/export/[tableName]/pdf/route.js';
let content = fs.readFileSync(routePath, 'utf8');

// 检查是否已修复
if (content.includes('totalColWidth > contentWidth')) {
    console.log('Already fixed');
    process.exit(0);
}

// 找到scaleFactor的位置并在前面添加代码
const scaleFactorPattern = /(const scaleFactor = contentWidth \/ totalColWidth)/;

if (scaleFactorPattern.test(content)) {
    const fixCode = `
    const totalColWidth = colWidths.reduce((sum, w) => sum + (w || 100), 0) || maxCol * 100;
    if (totalColWidth > contentWidth && !isLandscape) {
        pageWidth = 842;
        pageHeight = 595;
        contentWidth = pageWidth - marginLeft - marginRight;
    }
    `;
    
    content = content.replace(scaleFactorPattern, fixCode + '$1');
    fs.writeFileSync(routePath, content, 'utf8');
    console.log('Fixed successfully');
} else {
    console.log('Pattern not found');
    // 尝试其他方式
    console.log('Looking for other patterns...');
    if (content.includes('scaleFactor')) {
        console.log('Found scaleFactor');
    }
}
EOF
"""
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())

print("\n=== 复制到容器 ===")
cmd = "docker cp /tmp/fix_pdf.js zscx-web:/tmp/fix_pdf.js"
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())

print("\n=== 运行修复脚本 ===")
cmd = "docker exec zscx-web node /tmp/fix_pdf.js"
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
print(stderr.read().decode())

print("\n=== 验证修复 ===")
cmd = "docker exec zscx-web grep 'totalColWidth' /app/.next/server/app/api/export/[tableName]/pdf/route.js"
stdin, stdout, stderr = ssh.exec_command(cmd)
result = stdout.read().decode().strip()
print(f"totalColWidth代码: {'已添加' if result else '未添加'}")

print("\n=== 重启容器 ===")
cmd = "docker restart zscx-web"
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())

ssh.close()