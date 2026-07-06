import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('REDACTED_IP', port=22, username='REDACTED_USER', password='REDACTED_PASSWORD')

print("=== Checking container logs ===")
stdin, stdout, stderr = ssh.exec_command("echo 'REDACTED_PASSWORD' | sudo -S docker logs zscx-web --tail 100 2>&1")
logs = stdout.read().decode()
print(logs)

print("\n=== Checking error logs from database ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'REDACTED_PASSWORD' | sudo -S docker exec zscx-mysql mysql -uroot -proot123 zscx -e "SELECT * FROM ErrorLog ORDER BY createdAt DESC LIMIT 5;" 2>&1
""")
db_logs = stdout.read().decode()
print(db_logs)

ssh.close()