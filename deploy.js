// deploy.js - 修正后的版本
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 开始部署 SheepPD 拼豆管理系统...');

// 检查必要的文件
function checkProjectStructure() {
  console.log('📁 检查项目结构...');
  
  const requiredFiles = [
    'backend/server.js',
    'frontend/package.json',
    'frontend/vite.config.js' // 或其他的构建配置文件
  ];
  
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      console.log(`❌ 缺少必要文件: ${file}`);
      return false;
    }
  }
  console.log('✅ 项目结构检查通过');
  return true;
}

// 创建正确的 Vercel 配置
function createVercelConfig() {
  console.log('⚙️ 创建 Vercel 配置...');
  
  const vercelConfig = {
    "version": 2,
    "builds": [
      {
        "src": "backend/server.js",
        "use": "@vercel/node"
      },
      {
        "src": "frontend/dist/**",
        "use": "@vercel/static"
      }
    ],
    "routes": [
      {
        "src": "/api/(.*)",
        "dest": "/backend/server.js"
      },
      {
        "src": "/(.*)",
        "dest": "/frontend/dist/$1"
      }
    ],
    "env": {
      "MONGODB_URI": "@mongodb_uri"
    }
  };
  
  fs.writeFileSync('vercel.json', JSON.stringify(vercelConfig, null, 2));
  console.log('✅ Vercel 配置创建完成');
}

// 主部署函数
async function deploy() {
  try {
    // 1. 检查项目结构
    if (!checkProjectStructure()) {
      console.log('❌ 项目结构不完整，请检查文件');
      return;
    }
    
    // 2. 创建 Vercel 配置
    createVercelConfig();
    
    // 3. 部署到 Vercel
    console.log('🌐 开始部署到 Vercel...');
    console.log('请按照提示操作：');
    
    const deployProcess = spawn('npx', ['vercel', '--prod'], { 
      stdio: 'inherit',
      shell: true
    });
    
    deployProcess.on('close', (code) => {
      if (code === 0) {
        console.log('🎉 部署成功！');
        console.log('📱 现在您可以在任何地方访问您的拼豆管理系统了！');
      } else {
        console.log('❌ 部署失败');
      }
    });
    
  } catch (error) {
    console.error('部署出错:', error);
  }
}

deploy();