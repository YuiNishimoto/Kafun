import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// 期間の最大値
const periodMaxMap = {
	day: 6,
	week: 4,
	month: 12,
};

export default function FormPage() {
	const navigate = useNavigate();
	const ranOnce = useRef(false);

	// 質問
	const [diagnosed, setDiagnosed] = useState('');
	const [fever, setFever] = useState('');
	const [facePain, setFacePain] = useState('');
	const [eyeItch, setEyeItch] = useState('');
	const [nasal, setNasal] = useState('');
	const [cough, setCough] = useState('');
	const [sneeze, setSneeze] = useState('');
	
	// 期間
	const [periodType, setPeriodType] = useState('day');
	const [periodValue, setPeriodValue] = useState(1);
	const [periodMax, setPeriodMax] = useState(periodMaxMap['day']);
	
	// ウェルカムアラート
	useEffect(() => {
    	if (!ranOnce.current) {
			alert('Welcome to the Pollen Survey System Page!');
      		ranOnce.current = true;
    	}
  	}, []);
	
	// 期間タイプ変更時のリセットと最大値の設定
	useEffect(() => {
    	const max = periodMaxMap[periodType];
    	setPeriodMax(max);
    	setPeriodValue(1);
  	}, [periodType]);
	
	// 入力値を小数切り捨て・クランプ
	const handlePeriodInput = e => {
		const raw = e.target.value;
		if (raw === '') {
			setPeriodValue('');
			return;
		}
		
		const min = 1;
		const max = periodMax;
		let val = Number(raw);
		
		if (isNaN(val)) {
	  		setPeriodValue(min);
	  		return;
		}
		
		// 小数点以下切り捨て
		val = Math.trunc(val);
		// 小さすぎは min、大きすぎは max に丸める
		val = Math.min(Math.max(val, min), max);
		
  		if (val !== periodValue) {
    		setPeriodValue(val);
  		}
	};
	
	// フォーカスアウト時の検査
	const validatePeriod = () => {
		const min = 1;
	  	const max = periodMax;
	  	const raw = periodValue;
	
	  	// 空文字 or 非数値
	  	if (raw === '' || isNaN(raw)) {
			alert(`症状継続期間は1～${max}の範囲で入力してください`);
			setPeriodValue(min);
			return;
	  	}
	
	  	// 整数でないなら切り捨て
	  	if (!Number.isInteger(raw)) {
			alert('小数点以下は切り捨てられ、整数のみが有効です');
			setPeriodValue(Math.trunc(raw));
			return;
	  	}
	
	  	// 範囲チェック
	  	if (raw < min || raw > max) {
			alert(`症状継続期間は1～${max}の範囲で入力してください`);
			setPeriodValue(Math.min(Math.max(raw, min), max));
			return;
	  	}
	};
	
	// 送信＆位置情報取得
  	const handleCheck = () => {
    	// 送信前に質問に回答しているかチェック
    	if (
      		![diagnosed, fever, facePain, eyeItch, nasal, cough, sneeze].every(
        		v => v === 'yes' || v === 'no'
      		)
    	) {
      		alert('すべての質問に回答してください');
      		return;
    	}

    	if (!navigator.geolocation) {
      		const msg = 'お使いの端末は、GeoLocation APIに対応していません。';
      		alert(msg);
      		return navigate('/status', { state: { statusMessage: msg } });
    	}
    	
		navigator.geolocation.getCurrentPosition(
      		async position => {
        		const { latitude: lat, longitude: lng } = position.coords;
        		try {
					const res = await fetch('/api/locate', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							lat,
							lng,
							periodType,
							periodValue: Number(periodValue),
							diagnosed,
							fever,
							facePain,
							eyeItch,
							nasal,
							cough,
							sneeze,
          				}),
        			})
        			const json = await res.json();
        		
          			if (json.pollen && json.pollen.length) {
              			navigate('/status', {
              				state: { statusMessage: '取得完了', result: json },
            			});
            		} else {
            			navigate('/status', {
              				state: { statusMessage: '[エラー] ' + (json.message || 'データが取得できませんでした') },
						});
            		}
          		} catch (err) {
            		navigate('/status', {
            			state: { statusMessage: '[エラー] サーバ通信中にエラーが発生しました: ' + err.message },
          			});
          		}
      		},
      		error => {
        		const msgs = [
          			'原因不明のエラーが発生しました…',
          			'位置情報の取得が許可されませんでした…',
          			'電波状況などで位置情報が取得できませんでした…',
          			'位置情報の取得に時間がかかり過ぎてタイムアウトしました…',
        		];
        		const msg = `[エラー番号: ${error.code}]\n${msgs[error.code]}`;
        		alert(msg);
        		navigate('/status', { state: { statusMessage: msg } });
      		},
      		{ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    	);
	};
    
    return (
    	<div
    		className="App"
    		style={{
    			padding: '1rem',
    			maxWidth: 600,
    			margin: 'auto',
    			textAlign: 'center'
    		}}
    	>
      		<h1>Pollen Survey System</h1>
      		<p>
				「Check Geolocation」ボタンをクリックして、ブラウザが位置情報に対応しているかを
        		確認します。
      		</p>

			<fieldset>
				<legend>花粉症と診断されていますか？</legend>
				<label>
					<input
						type="radio"
						name="diagnosed"
						value="yes"
						checked={diagnosed === 'yes'}
						onChange={() => setDiagnosed('yes')}
					/>
					はい
				</label>
				<label style={{ marginLeft: '1em' }}>
					<input
						type="radio"
						name="diagnosed"
						value="no"
						checked={diagnosed === 'no'}
						onChange={() => setDiagnosed('no')}
					/>
					いいえ
				</label>
			</fieldset>
			
			<fieldset>
				<legend>発熱はありますか？</legend>
				<label>
					<input
						type="radio"
						name="fever"
						value="yes"
						checked={fever === 'yes'}
						onChange={() => setFever('yes')}
					/>
					はい
				</label>
				<label style={{ marginLeft: '1em' }}>
					<input
						type="radio"
						name="fever"
						value="no"
						checked={fever === 'no'}
						onChange={() => setFever('no')}
					/>
					いいえ
				</label>
			</fieldset>
			
			<fieldset>
				<legend>目や頬の奥は痛みますか？</legend>
				<label>
					<input
						type="radio"
						name="facePain"
						value="yes"
						checked={facePain === 'yes'}
						onChange={() => setFacePain('yes')}
					/>
					はい
				</label>
				<label style={{ marginLeft: '1em' }}>
					<input
						type="radio"
						name="facePain"
						value="no"
						checked={facePain === 'no'}
						onChange={() => setFacePain('no')}
					/>
					いいえ
				</label>
			</fieldset>
			
			<fieldset>
				<legend>目のかゆみはありますか？</legend>
				<label>
					<input
						type="radio"
						name="eyeItch"
						value="yes"
						checked={eyeItch === 'yes'}
						onChange={() => setEyeItch('yes')}
					/>
					はい
				</label>
				<label style={{ marginLeft: '1em' }}>
					<input
						type="radio"
						name="eyeItch"
						value="no"
						checked={eyeItch === 'no'}
						onChange={() => setEyeItch('no')}
					/>
					いいえ
				</label>
			</fieldset>
			
			<fieldset>
				<legend>鼻水は出ますか？</legend>
				<label>
					<input
						type="radio"
						name="nasal"
						value="yes"
						checked={nasal === 'yes'}
						onChange={() => setNasal('yes')}
					/>
					はい
				</label>
				<label style={{ marginLeft: '1em' }}>
					<input
						type="radio"
						name="nasal"
						value="no"
						checked={nasal === 'no'}
						onChange={() => setNasal('no')}
					/>
					いいえ
				</label>
			</fieldset>
	
			<fieldset>
				<legend>咳は出ますか？</legend>
				<label>
					<input
						type="radio"
						name="cough"
						value="yes"
						checked={cough === 'yes'}
						onChange={() => setCough('yes')}
					/>
					はい
				</label>
				<label style={{ marginLeft: '1em' }}>
					<input
						type="radio"
						name="cough"
						value="no"
						checked={cough === 'no'}
						onChange={() => setCough('no')}
					/>
					いいえ
				</label>
			</fieldset>
	
			<fieldset>
				<legend>くしゃみはよく出ますか？</legend>
				<label>
					<input
						type="radio"
						name="sneeze"
						value="yes"
						checked={sneeze === 'yes'}
						onChange={() => setSneeze('yes')}
					/>
					はい
				</label>
				<label style={{ marginLeft: '1em' }}>
					<input
						type="radio"
						name="sneeze"
						value="no"
						checked={sneeze === 'no'}
						onChange={() => setSneeze('no')}
					/>
					いいえ
				</label>
			</fieldset>
			
			<div style={{ marginTop: '1em' }}>
				<label>
					症状継続期間：
					<select
						value={periodType}
						onChange={e => setPeriodType(e.target.value)}
					>
						<option value="day">日</option>
						<option value="week">週</option>
						<option value="month">月</option>
					</select>
					<input
						type="number"
						value={periodValue}
						min={1}
						max={periodMax}
						onChange={handlePeriodInput}
						onBlur={validatePeriod}
						style={{ width: '4em', marginLeft: '0.5em' }}
					/>
				</label>
			</div>
			
			<button
				onClick={handleCheck}
				style={{ marginTop: '1em', padding: '0.5em 1em' }}
			>
				Check Geolocation
			</button>
		</div>
	);
}