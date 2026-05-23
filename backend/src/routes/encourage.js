const express = require('express');
const OpenAI = require('openai');
const router = express.Router();

function getClient() {
  if (!process.env.LLM_API_KEY) throw new Error('LLM_API_KEY is not configured');
  return new OpenAI({ apiKey: process.env.LLM_API_KEY, baseURL: process.env.LLM_BASE_URL });
}

router.post('/', async (req, res) => {
  const { task, duration } = req.body;

  try {
    const completion = await getClient().chat.completions.create({
      model: process.env.LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: `你是一个充满感染力的ADHD教练。用户刚完成了一个任务。
给出一句极具力量感和感染力的鼓励（不超过30字），像在为对方欢呼喝彩！
风格热情奔放，可以加感叹号，让对方感受到真实的喜悦。`
        },
        {
          role: 'user',
          content: `刚完成：${task}，用时：${Math.round((duration || 0) / 60)} 分钟`
        }
      ],
    });

    res.json({ message: completion.choices[0].message.content });
  } catch (err) {
    console.error('encourage error:', err.message);
    res.status(500).json({ error: 'AI request failed' });
  }
});

module.exports = router;
