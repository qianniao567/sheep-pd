const { MongoClient } = require('mongodb');

// 你的连接字符串
const uri = "mongodb+srv://sheepPD_user:20040502Wxy@cluster0.zgepp8x.mongodb.net/sheepPD?retryWrites=true&w=majority";

async function testConnection() {
  try {
    console.log('正在测试连接...');
    console.log('连接字符串:', uri.replace(/:([^:]+)@/, ':****@'));
    
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000
    });
    
    await client.connect();
    console.log('✅ 连接成功!');
    
    const db = client.db('sheepPD');
    const collections = await db.listCollections().toArray();
    console.log('数据库中的集合:', collections.map(c => c.name));
    
    // 测试查询
    const inventory = await db.collection('inventory').find().toArray();
    console.log('库存数据:', inventory.length, '条记录');
    
    await client.close();
  } catch (error) {
    console.error('❌ 连接失败:', error.message);
    console.error('完整错误:', error);
  }
}

testConnection();