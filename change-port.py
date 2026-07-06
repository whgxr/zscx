import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

# 检查是否有.env文件
print("=== Checking for .env file ===")
stdin, stdout, stderr = ssh.exec_command("ls -la /vol3/1000/docker/zscx/docker/.env 2>&1")
print(stdout.read().decode())

# 如果没有.env文件，创建一个并设置WEB_PORT=777
print("\n=== Setting WEB_PORT=777 ===")
stdin, stdout, stderr = ssh.exec_command("""
cd /vol3/1000/docker/zscx/docker
if [ ! -f .env ]; then
    echo "WEB_PORT=777" > .env
    echo "Created .env with WEB_PORT=777"
else
    if grep -q "WEB_PORT" .env; then
        sed -i 's/WEB_PORT=.*/WEB_PORT=777/' .env
        echo "Updated WEB_PORT=777 in .env"
    else
        echo "WEB_PORT=777" >> .env
        echo "Added WEB_PORT=777 to .env"
    fi
fi
cat .env
""")
print(stdout.read().decode())

# 重新启动容器
print("\n=== Restarting containers with new port ===")
stdin, stdout, stderr = ssh.exec_command("""
cd /vol3/1000/docker/zscx/docker
echo 'Thomas009865' | sudo -S docker compose up -d 2>&1
""")
print(stdout.read().decode())

# 检查新的端口映射
print("\n=== Checking new port mapping ===")
stdin, stdout, stderr = ssh.exec_command("echo 'Thomas009865' | sudo -S docker port zscx-web 2>&1")
print(stdout.read().decode())

ssh.close()
print("\n✅ Done!")
