import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

# 检查layout.tsx是否包含权限过滤代码
print("=== Checking deployed layout.tsx ===")
stdin, stdout, stderr = ssh.exec_command("grep -n 'canView' /vol3/1000/docker/zscx/web/app/dashboard/layout.tsx")
result = stdout.read().decode()
if result:
    print("✅ Permission filter code found:")
    print(result)
else:
    print("❌ Permission filter code NOT found - need to re-upload")

# 显示当前layout.tsx内容
stdin, stdout, stderr = ssh.exec_command("cat /vol3/1000/docker/zscx/web/app/dashboard/layout.tsx")
print("\n=== Current layout.tsx content ===")
print(stdout.read().decode())

ssh.close()