const express = require('express');
const OpenAI = require('openai');
const router = express.Router();

function getClient() {
  if (!process.env.LLM_API_KEY) throw new Error('LLM_API_KEY is not configured');
  return new OpenAI({ apiKey: process.env.LLM_API_KEY, baseURL: process.env.LLM_BASE_URL });
}

router.post('/', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  if (text.length > 1000) return res.status(400).json({ error: '输入过长，请控制在 1000 字以内' });

  try {
    console.log('[organize] 收到文本:', text.substring(0, 100));

    const completion = await getClient().chat.completions.create({
      model: process.env.LLM_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一个帮助 ADHD 用户的任务拆解助手。用户会倾倒混乱的思绪、待办事项或烦恼。

请将用户的话拆解为 3-5 条清晰、具体、可立即执行的子任务。

每条任务需满足：
1. 编号 1、2、3… 按执行顺序排列
2. 内容具体可操作，每条 10-20 字，不含模糊词
3. 分配预估时间（分钟），范围 5-30 分钟，ADHD 用户适合短时间任务
4. 难度要有起伏：不要连续安排同样难度的任务，比如先一个简单（5-10分钟），再一个中等（10-20分钟），再一个简单… 交替安排
5. 不要安排大段时间做重复的事情

严格返回以下 JSON 格式（不要包含任何其他内容）：
{
  "tasks": [
    {"content": "打开邮箱，找到王经理的未读邮件并回复", "estimatedMinutes": 10},
    {"content": "打开 Excel 模板，填入 3 月的销售数据", "estimatedMinutes": 15},
    {"content": "把桌面文件拖进分类文件夹，清空回收站", "estimatedMinutes": 5}
  ]
}`
        },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0].message.content;
    console.log('[organize] AI 原始返回:', raw);

    // 容错：尝试提取 JSON（有时 AI 可能包裹在 ```json 中）
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const result = JSON.parse(cleaned);
    console.log('[organize] 解析结果:', JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error('[organize] error:', err.message);
    res.status(500).json({ error: 'AI request failed' });
  }
});

module.exports = router;
