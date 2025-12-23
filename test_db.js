const { MongoClient } = require('mongodb');

// 替换为你的连接字符串
const uri = "mongodb+srv://sheepPD_user:20040502Wxy@cluster0.zgepp8x.mongodb.net/sheepPD?retryWrites=true&w=majority";

async function testConnection() {
  try {
    console.log('正在测试连接...');
    const client = new MongoClient(uri);
    await client.connect();
    console.log('✅ 连接成功!');
    
    const db = client.db('sheepPD');
    const collections = await db.listCollections().toArray();
    console.log('数据库中的集合:', collections.map(c => c.name));
    
    await client.close();
  } catch (error) {
    console.error('❌ 连接失败:', error.message);
  }
}

testConnection();