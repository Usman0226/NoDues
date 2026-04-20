#!/bin/bash

# NoDues Azure VM Setup Script
# Use: curl -sSL https://raw.githubusercontent.com/your-repo/setup.sh | bash

set -e

echo "🚀 Starting NoDues Azure VM Setup (B2s Optimized)"

# 1. Update & Install Docker
echo "📦 Installing Docker..."
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
sudo apt-get update
sudo apt-get install -y docker-ce docker-compose

# 2. Setup directory
echo "📁 Creating application directory..."
mkdir -p ~/nodues-backend
cd ~/nodues-backend

# 3. Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "🔑 Configuring Environment Variables..."
    read -p "Enter MongoDB URI: " mongo_uri
    read -p "Enter JWT Secret: " jwt_secret
    read -p "Enter Client URL (Vercel): " client_url
    
    cat <<EOF > .env
NODE_ENV=production
PORT=5000
MONGODB_URI=$mongo_uri
JWT_SECRET=$jwt_secret
CLIENT_URL=$client_url
EOF
    echo "✅ .env created."
fi

# 4. Final instructions
echo ""
echo "📍 NEXT STEPS:"
echo "1. Upload your server code to ~/nodues-backend (excluding node_modules)."
echo "2. Run: sudo docker-compose up -d --build"
echo "3. Visit your Cloudflare dashboard to verify the tunnel status."
echo ""
echo "✅ Setup Complete!"
