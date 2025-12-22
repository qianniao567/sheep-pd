const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://sheepPD_user:20040502Wxy@cluster0.zgepp8x.mongodb.net/sheepPD?retryWrites=true&w=majority';

async function clearDatabase() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db('sheepPD');
    const result = await db.collection('inventory').deleteMany({});
    console.log(`已删除 ${result.deletedCount} 条记录`);
  } catch (e) {
    console.error('清空数据库失败:', e);
  } finally {
    await client.close();
  }
}

clearDatabase();