import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import fs      from 'fs';
import path    from 'path';
import * as turf    from '@turf/turf';
import fetch   from 'node-fetch';
import { parse } from 'csv-parse/sync';
import { fileURLToPath }  from 'url';
import OpenAI from "openai";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app   = express();
const PORT  = process.env.PORT || 34356;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public_html')));

// GeoJSON を読み込む
const geoJson  = JSON.parse(
	fs.readFileSync(path.join(__dirname, 'N03-20250101.geojson'), 'utf8')
);
const features = geoJson.features;

// 日付を YYYYMMDD 文字列に整形
function fmtDate(date){
	const y = date.getFullYear();
	const m = date.getMonth()+1;
	const d = date.getDate();
	return `${y}${m.toString().padStart(2,'0')}${d.toString().padStart(2,'0')}`;
}

app.post('/api/locate', async (req, res) => {
	try {
		const {
			lat,
			lng,
			periodType,
			periodValue,
			diagnosed,
			fever,
			facePain,
			eyeItch,
			nasal,
			cough,
			sneeze,
			outdoor
		} = req.body;
		
		const periodLabels = { day: '日', week: '週', month: '月' };
    	const periodLabel  = periodLabels[periodType] || '';

		// 症状継続期間が有効なものかの確認
		const ranges = { day: [1, 6], week: [1, 4], month: [1, 12] };
		if (
			!ranges[periodType] ||
			typeof periodValue !== 'number' ||
			periodValue < ranges[periodType][0] ||
			periodValue > ranges[periodType][1]
		) {
			return res
				.status(400)
				.json({ error: '症状継続期間の入力が不正です', periodType, periodValue });
		}


		// 位置判定
		const pt = turf.point([lng, lat]);
		let city = null;
		let ward = null;
		let citycode = null;
		
		for (const feat of features) {
			if (turf.booleanPointInPolygon(pt, feat)) {
				city = feat.properties.N03_004; // 市
				ward = feat.properties.N03_005; // 区町村・郡
				citycode = feat.properties.N03_007; // 全国地方公共団体コード
				break;
			}
		}
		
		// 見つからなかった場合
		if (!citycode) {
			return res.json({
				city: null,
				ward: null,
				citycode: null,
				pollen: [],
				message:'行政区域コードが見つかりませんでした'
			});
		}
		
		// API用日付計算
		const today = new Date();
		const end = fmtDate(today);
		const start = fmtDate(new Date(today.getTime() - 7*24*60*60*1000));
		
		// 花粉API呼び出し
		const apiUrl = `https://wxtech.weathernews.com/opendata/v1/pollen`
						+ `?citycode=${citycode}&start=${start}&end=${end}`;
					
		const resp    = await fetch(apiUrl);
		const csvText = await resp.text();

		// CSVをパース（同期版）
		const records = parse(csvText, {
			columns: true,      // ヘッダ行をキーに
			skip_empty_lines: true
		});

		const validRecords = records.filter(r => {
			const cnt = Number(r.pollen);
			return cnt !== -9999;
		});

		const prompt = `過去1週間の花粉飛散量とユーザーの症状回答をもとに、花粉症とどの程度疑われるかを日本語で簡潔にまとめてください。
【症状期間】
症状は${periodValue}${periodLabel}続いています。

【花粉データ】
${JSON.stringify(validRecords, null, 2)}

【症状回答】
${JSON.stringify(
  { diagnosed, fever, facePain, eyeItch, nasal, cough, sneeze, outdoor },
  null, 2
)}

ただし、以下の条件・考え方を守ってください。
・回答の最初に「あなたの花粉症度は〇〇です。」と言って、「〇〇」には0から100の数字を入れてください。花粉症が原因のときは大きい数字、風邪・副鼻腔炎が原因のときは小さい数字を入れてください。
・次に最も疑われる原因を「あなたの症状で最も疑われる原因は、（花粉症・風邪・副鼻腔炎）と考えられます。」と言ってください。
・次にスギやヒノキなど、その時期に疑われるアレルゲンを示してください。
・花粉データは「2025-07-10T00:00:00+09:00: 1」のようになっており、「2025-07-10T00:00:00+09:00」が時間、「1」が花粉飛散量（花粉の個数/cm^2）です。
・症状期間が長いほど花粉症と考えられ、2週間を超える場合は風邪ではないと考えられます。
・花粉症と診断されている場合、されてない場合に比べて、花粉症が原因である可能性が高いと言えます。
・目のかゆみがある場合、花粉症と考えられます。
・一番最後の回答は、屋内にいる時よりも外にいる時に症状を感じるかどうかの回答です。そう感じない場合はいいえと答えています。
・屋外の方が症状を強く感じる場合、花粉症と考えられます。
・くしゃみがよく出る場合、副鼻腔炎ではないと考えられます。
・発熱している場合、風邪と考えられますが、目や頬の奥が痛い場合には、副鼻腔炎が考えられるため、花粉症ではないと言い切れません。
・目のかゆみがなくて、鼻水も出ないのに咳が出る場合、風邪と考えられます。
`;
		const chat = await openai.chat.completions.create({
			model: 'gpt-4.1-mini-2025-04-14',
			messages: [
				{ role: 'system', content: 'あなたは花粉の専門家です。' },
				{ role: 'user',   content: prompt }
			],
			temperature: 0.7
		});
		const analysis = chat.choices[0].message.content.trim();

		return res.json({city, ward, analysis});

	} catch (err) {
		console.error(err);
		return res.status(500).json({
			error: 'サーバー内部エラー',
			detail: err.message
		});
	}
});

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});