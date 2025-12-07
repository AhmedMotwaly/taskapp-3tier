#!/bin/bash
# ============================================
# TaskApp EC2 User Data Script
# Automatically installs and configures the application
# ============================================

set -e  # Exit on any error

# Log everything
exec > >(tee /var/log/taskapp-install.log)
exec 2>&1

echo "================================================"
echo "Starting TaskApp Installation"
echo "Time: $(date)"
echo "================================================"

# ============================================
# Update System
# ============================================
echo "📦 Updating system packages..."
yum update -y

# ============================================
# Install Required Software
# ============================================
echo "📦 Installing Python, Nginx, Git..."
yum install -y python3 python3-pip nginx git

# ============================================
# Create Application Directory
# ============================================
echo "📁 Creating application directory..."
mkdir -p /opt/taskapp
cd /opt/taskapp

# ============================================
# Create Application Files
# ============================================
echo "📝 Creating application files..."

# Create requirements.txt
cat > /opt/taskapp/requirements.txt << 'EOFREQ'
Flask==3.0.0
mysql-connector-python==8.2.0
python-dotenv==1.0.0
boto3==1.34.0
bcrypt==4.1.2
Werkzeug==3.0.1
gunicorn==21.2.0
EOFREQ

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip3 install -r requirements.txt

# ============================================
# Get RDS Endpoint from AWS
# ============================================
echo "🔍 Fetching RDS endpoint..."
REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
RDS_ENDPOINT=$(aws rds describe-db-instances \
  --region $REGION \
  --db-instance-identifier taskapp-database \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text 2>/dev/null || echo "taskapp-database.cf0qmmi8ur42.eu-central-1.rds.amazonaws.com")

echo "📊 RDS Endpoint: $RDS_ENDPOINT"

# ============================================
# Create Environment File
# ============================================
echo "⚙️ Creating environment configuration..."
cat > /opt/taskapp/.env << EOENV
DB_HOST=$RDS_ENDPOINT
DB_USER=admin
DB_PASSWORD=nokia1983
DB_NAME=taskapp-database
DB_PORT=3306
FLASK_ENV=production
SECRET_KEY=$(openssl rand -hex 32)
AWS_REGION=$REGION
EOENV

# ============================================
# Create Application Code
# ============================================
echo "📝 Creating application code..."

# We'll create a minimal version first, then you can deploy updates via GitHub
cat > /opt/taskapp/app.py << 'EOFAPP'
from flask import Flask, jsonify
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

@app.route('/')
def index():
    return '''
    <html>
    <head>
        <title>TaskApp - Coming Soon</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
        <div class="container">
            <div class="row justify-content-center align-items-center min-vh-100">
                <div class="col-md-6 text-center">
                    <div class="card shadow">
                        <div class="card-body p-5">
                            <i class="fas fa-check-circle fa-4x text-success mb-3"></i>
                            <h1 class="display-4">TaskApp is Running!</h1>
                            <p class="lead text-muted">Your application is successfully deployed on AWS</p>
                            <hr class="my-4">
                            <p><strong>Infrastructure:</strong> EC2 + RDS + VPC</p>
                            <p><strong>Region:</strong> ''' + os.getenv('AWS_REGION', 'N/A') + '''</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    </body>
    </html>
    '''

@app.route('/health')
def health():
    return jsonify({
        'status': 'healthy',
        'region': os.getenv('AWS_REGION', 'unknown')
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
EOFAPP

# ============================================
# Create Systemd Service
# ============================================
echo "⚙️ Creating systemd service..."
cat > /etc/systemd/system/taskapp.service << 'EOFSVC'
[Unit]
Description=TaskApp Flask Application
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/taskapp
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/opt/taskapp/.env
ExecStart=/usr/local/bin/gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 120 --access-logfile /var/log/taskapp-access.log --error-logfile /var/log/taskapp-error.log app:app
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOFSVC

# ============================================
# Configure Nginx
# ============================================
echo "🌐 Configuring Nginx..."
cat > /etc/nginx/conf.d/taskapp.conf << 'EOFNGX'
server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    location /health {
        proxy_pass http://127.0.0.1:5000/health;
        proxy_set_header Host $host;
        access_log off;
    }
}
EOFNGX

# Remove default nginx config
rm -f /etc/nginx/nginx.conf.default /etc/nginx/sites-enabled/default 2>/dev/null || true

# ============================================
# Set Permissions
# ============================================
echo "🔐 Setting permissions..."
chown -R ec2-user:ec2-user /opt/taskapp
chmod +x /opt/taskapp/app.py

# ============================================
# Enable and Start Services
# ============================================
echo "🚀 Starting services..."
systemctl daemon-reload
systemctl enable taskapp nginx
systemctl start taskapp
systemctl start nginx

# ============================================
# Install CloudWatch Agent
# ============================================
echo "📊 Installing CloudWatch agent..."
yum install -y amazon-cloudwatch-agent

# Create CloudWatch config
cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json << 'EOFCW'
{
  "metrics": {
    "namespace": "TaskApp/EC2",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {"name": "cpu_usage_idle", "unit": "Percent"},
          {"name": "cpu_usage_iowait", "unit": "Percent"}
        ],
        "metrics_collection_interval": 60
      },
      "mem": {
        "measurement": [
          {"name": "mem_used_percent", "unit": "Percent"}
        ],
        "metrics_collection_interval": 60
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/taskapp-access.log",
            "log_group_name": "/aws/ec2/taskapp",
            "log_stream_name": "{instance_id}/access"
          },
          {
            "file_path": "/var/log/taskapp-error.log",
            "log_group_name": "/aws/ec2/taskapp",
            "log_stream_name": "{instance_id}/error"
          }
        ]
      }
    }
  }
}
EOFCW

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json \
  -s

# ============================================
# Verify Installation
# ============================================
echo "================================================"
echo "✅ Installation Complete!"
echo "================================================"
echo "Services Status:"
systemctl status taskapp --no-pager | head -5
systemctl status nginx --no-pager | head -5
echo "================================================"
echo "Installation finished at: $(date)"
echo "================================================"