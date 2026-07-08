import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865', timeout=60)

def run(cmd, timeout=30):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    return out

out = run("echo Thomas009865 | sudo -S docker exec zscx-web sh -c 'ls /app/.next/static/chunks/6278-*.js'")
chunk = out.strip().split()[0]
print(f"=== Chunk: {chunk} ===")

content = run(f"echo Thomas009865 | sudo -S docker exec zscx-web cat {chunk}")

idx = content.find('renderSubGroup')
print("\n=== renderSubGroup signature ===")
print(content[idx:idx+120] if idx >= 0 else "NOT FOUND")

print("\n=== parentColumns count ===")
print(content.count('parentColumns'))

idx3 = content.find('/t*100')
print("\n=== /t*100 (width ratio) ===")
if idx3 >= 0:
    print(content[idx3-30:idx3+50])
else:
    print("NOT FOUND")

ssh.close()
