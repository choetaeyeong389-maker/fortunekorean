import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ path: '../.env' });

const app = express();

// CORS - Vercel 도메인 허용 (배포 후 실제 URL로 교체)
app.use(cors({
  origin: [
    'http://localhost:5173',
    /\.vercel\.app$/,     // 모든 vercel.app 서브도메인 허용
  ],
  methods: ['GET', 'POST'],
}));

app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MOCK_FORTUNES = [
  `오늘은 새벽 이슬처럼 맑고 고요한 기운이 당신을 감싸고 있습니다. 오랫동안 미뤄왔던 일에 첫걸음을 내딛기에 더없이 좋은 날입니다. 작은 용기 하나가 오늘 당신의 하루 전체를 빛나게 만들 것입니다.\n[조언]: 완벽한 때를 기다리지 말고, 지금 이 순간이 바로 시작할 최적의 시간임을 기억하세요.`,
  `봄비가 대지를 적시듯, 따뜻한 인연이 당신의 곁에 조용히 다가오고 있습니다. 오늘은 주변 사람들의 작은 말 한마디에 귀 기울여 보세요. 예상치 못한 곳에서 깊은 위로와 영감을 얻게 될 것입니다.\n[조언]: 혼자 감당하려 하지 말고, 믿는 사람에게 솔직하게 마음을 열어보세요.`,
  `당신이 걸어온 길은 결코 헛되지 않았습니다. 보이지 않는 곳에서 차곡차곡 쌓여온 노력들이 조금씩 빛을 발하기 시작하는 시기입니다. 오늘 하루는 결과보다 과정 자체에 의미를 두어 보세요.\n[조언]: 남과 비교하는 대신, 어제의 나보다 한 걸음 더 나아간 오늘을 칭찬해 주세요.`,
  `고요한 호수 위에 돌멩이 하나가 떨어지면 파문이 멀리 퍼져나가듯, 오늘 당신의 작은 행동이 뜻밖의 큰 변화를 만들어낼 수 있습니다. 두려움보다 설렘을 선택하는 하루가 되길 바랍니다.\n[조언]: 마음속에 오래 담아둔 감사의 말을 오늘 용기 내어 전해보세요.`,
  `흐린 날이 있어야 맑은 날의 소중함을 알 수 있습니다. 지금 힘들게 느껴지는 순간도 당신을 더 단단하게 만드는 과정임을 잊지 마세요.\n[조언]: 완벽하지 않아도 괜찮습니다. 있는 그대로의 당신이 충분히 소중한 사람입니다.`,
];

async function streamMock(res, text) {
  for (const char of text) {
    res.write(`data: ${JSON.stringify({ text: char })}\n\n`);
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 40));
  }
}

app.post('/api/fortune', async (req, res) => {
  const { history = [] } = req.body;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const useMock = !process.env.OPENAI_API_KEY;

  if (useMock) {
    const usedIdx = history.map((h) =>
      MOCK_FORTUNES.findIndex((f) => f.slice(0, 20) === h.slice(0, 20))
    );
    const pool = MOCK_FORTUNES.map((_, i) => i).filter((i) => !usedIdx.includes(i));
    const idx = (pool.length > 0 ? pool : MOCK_FORTUNES.map((_, i) => i))[
      Math.floor(Math.random() * (pool.length || MOCK_FORTUNES.length))
    ];
    await streamMock(res, MOCK_FORTUNES[idx]);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

  const historyText = history.length > 0
    ? `\n\n[이전 운세 반복 금지]\n${history.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
    : '';

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      temperature: 1.0,
      messages: [
        {
          role: 'system',
          content: `당신은 따뜻하고 긍정적인 운세 전문가입니다. 오늘의 운세를 3~4문장으로 작성하세요. 동기부여와 위로를 중심으로 감성적이고 시적인 문체를 사용하세요. 반드시 마지막 줄에 "[조언]: " 으로 시작하는 한 문장 조언을 추가하세요. 매번 완전히 다른 관점과 표현을 사용하세요.${historyText}`,
        },
        { role: 'user', content: '오늘 나의 운세와 조언을 알려주세요.' },
      ],
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error('OpenAI error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  const mode = process.env.OPENAI_API_KEY ? 'GPT-4o MODE' : 'MOCK MODE';
  console.log(`✨ Fortune server (${mode}) running on http://localhost:${PORT}`);
});
