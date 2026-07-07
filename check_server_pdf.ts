import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

print("=== 检查服务器上的pdf route.ts ===")
cmd = "cat /vol3/1000/docker/zscx/web/app/api/export/[tableName]/pdf/route.ts | head -300 | tail -20"
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())

print("\n=== 检查关键行 ===")
cmd = "sed -n '285,295p' /vol3/1000/docker/zscx/web/app/api/export/[tableName]/pdf/route.ts"
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())

print("\n=== 检查exportTemplatePdf函数中的边距 ===")
cmd = "sed -n '930,945p' /vol3/1000/docker/zscx/web/app/api/export/[tableName]/pdf/route.ts"
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())

print("\n=== 检查容器内的构建产物 ===")
cmd = "docker exec zscx-web grep -n 'marginLeft' /app/.next/server/app/api/export/[tableName]/pdf/route.js | head -10"
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())

ssh.close()