import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, Clock, CalendarHeart, Utensils, Coffee, Moon, Sun, 
  PlusCircle, Trash2, Scale, Activity, TrendingDown, CheckCircle2,
  Dumbbell, Smartphone, Share, Sparkles, MessageCircle, Bot, ImagePlus
} from 'lucide-react';
import { supabase, DEMO_MODE } from './lib/supabase';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_API_URL = apiKey ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}` : '';

const callGeminiAPI = async (payload, retries = 5) => {
  if (!apiKey) return "（Gemini APIキーを設定するとAI機能が使えます）";
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "AIからの応答がありませんでした。";
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
};

// デモ用の疑似Timestamp
const serverTimestamp = () => ({ toMillis: () => Date.now() });

const mapMeal = (row) => ({
  id: row.id,
  image: row.image,
  timing: row.timing,
  memo: row.memo,
  score: row.score,
  scoreComment: row.score_comment,
  eatingOrder: row.eating_order,
  createdAt: row.created_at
});

const mapBodyStat = (row) => ({
  id: row.id,
  weight: Number(row.weight),
  bodyFat: row.body_fat != null ? Number(row.body_fat) : null,
  muscle: row.muscle != null ? Number(row.muscle) : null,
  createdAt: row.created_at
});

const mapWorkout = (row) => ({
  id: row.id,
  activity: row.activity,
  createdAt: row.created_at
});

// 人に見せる用：画面にはサンプルデータのみ表示（本番利用時は false に変更）
const SAMPLE_DISPLAY = true;
const SAMPLE_TARGET_WEIGHT = 50;
const SAMPLE_CURRENT_WEIGHT = 55;

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const SAMPLE_BODY_RECORDS = [
  { id: 'sample-body-1', weight: 55.0, bodyFat: 28.0, muscle: 24.0, createdAt: daysAgo(0), isSample: true },
  { id: 'sample-body-2', weight: 55.8, bodyFat: 28.3, muscle: 23.9, createdAt: daysAgo(7), isSample: true },
];

const SAMPLE_WORKOUT_RECORDS = [
  { id: 'sample-workout-1', activity: 'カーブス', createdAt: daysAgo(2), isSample: true },
  { id: 'sample-workout-2', activity: 'カーブス', createdAt: daysAgo(9), isSample: true },
];

const SAMPLE_MEAL_RECORDS = [
  {
    id: 'sample-meal-1',
    image: null,
    timing: '昼食',
    memo: '【サンプル】バランスの良い食事の記録例です。',
    score: 78,
    scoreComment: 'サンプル評価：野菜・たんぱく質・主食のバランスは良好です。',
    eatingOrder: '1. サラダ\n2. 魚の主菜\n3. ごはん（少なめ）',
    createdAt: daysAgo(0),
    isSample: true
  },
];

const parseMealAnalysisResponse = (text) => {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Math.min(100, Math.max(0, Math.round(Number(parsed.score))));
      return {
        score: Number.isFinite(score) ? score : null,
        scoreComment: parsed.scoreComment || '',
        eatingOrder: parsed.eatingOrder || '',
        analysis: parsed.analysis || text
      };
    }
  } catch (_) {}
  const scoreMatch = text.match(/(\d{1,3})\s*点/);
  return {
    score: scoreMatch ? Math.min(100, parseInt(scoreMatch[1], 10)) : null,
    scoreComment: '',
    eatingOrder: '',
    analysis: text
  };
};

const getScoreStyle = (score) => {
  if (score >= 80) return { ring: 'border-green-400', text: 'text-green-600', bg: 'bg-green-50' };
  if (score >= 60) return { ring: 'border-orange-400', text: 'text-orange-600', bg: 'bg-orange-50' };
  return { ring: 'border-red-400', text: 'text-red-600', bg: 'bg-red-50' };
};

const EatingOrderDisplay = ({ eatingOrder }) => {
  if (!eatingOrder) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <p className="font-bold text-amber-800 mb-2 flex items-center gap-2">
        <Utensils className="w-4 h-4" /> 食べる順番
      </p>
      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{eatingOrder}</p>
    </div>
  );
};

const MealScoreDisplay = ({ score, comment, size = 'md' }) => {
  if (score == null) return null;
  const style = getScoreStyle(score);
  const sizeClass = size === 'lg'
    ? 'w-24 h-24 text-3xl'
    : 'w-16 h-16 text-xl';
  return (
    <div className={`flex items-center gap-3 ${style.bg} rounded-xl p-3 border ${style.ring}`}>
      <div className={`${sizeClass} rounded-full border-4 ${style.ring} flex items-center justify-center font-extrabold ${style.text} flex-shrink-0`}>
        {score}
      </div>
      <div className="min-w-0">
        <p className={`font-bold ${style.text}`}>今回の食事：{score}点 / 100点</p>
        {comment && <p className="text-sm text-gray-600 mt-1">{comment}</p>}
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('meal');
  
  const [mealRecords, setMealRecords] = useState([]);
  const [bodyRecords, setBodyRecords] = useState([]);
  const [workoutRecords, setWorkoutRecords] = useState([]);

  const [imagePreview, setImagePreview] = useState(null);
  const [timing, setTiming] = useState('朝食');
  const [memo, setMemo] = useState('');
  const [inputWeight, setInputWeight] = useState('');
  const [inputBodyFat, setInputBodyFat] = useState('');
  const [inputMuscle, setInputMuscle] = useState('');
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showPwaPrompt, setShowPwaPrompt] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mealScore, setMealScore] = useState(null);
  const [mealScoreComment, setMealScoreComment] = useState('');
  const [mealEatingOrder, setMealEatingOrder] = useState('');
  const [coachMessage, setCoachMessage] = useState('');
  const [isCoaching, setIsCoaching] = useState(false);
  const [authError, setAuthError] = useState('');

  const displayBodyRecords = SAMPLE_DISPLAY ? SAMPLE_BODY_RECORDS : bodyRecords;
  const displayMealRecords = SAMPLE_DISPLAY ? SAMPLE_MEAL_RECORDS : mealRecords;
  const displayWorkoutRecords = SAMPLE_DISPLAY ? SAMPLE_WORKOUT_RECORDS : workoutRecords;

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIOSDevice);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isIOSDevice && !isStandalone) setShowPwaPrompt(true);
  }, []);

  // --- 認証（Supabase 匿名ログイン） ---
  useEffect(() => {
    if (DEMO_MODE) {
      setUser({ id: 'demo-user' });
      return;
    }
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          setAuthError('');
          return;
        }
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.error('Auth Error:', error);
          setAuthError(
            error.message?.includes('anonymous') || error.message?.includes('Anonymous')
              ? 'Supabase で「Anonymous sign-ins（匿名ログイン）」を有効にしてください。Authentication → Providers → Anonymous → Enable'
              : `ログインに失敗しました: ${error.message}`
          );
          return;
        }
        if (data.user) {
          setUser(data.user);
          setAuthError('');
        }
      } catch (error) {
        console.error('Auth Error:', error);
        setAuthError('Supabase への接続に失敗しました。.env の URL とキーを確認してください。');
      }
    };
    initAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        setAuthError('');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // --- データ取得（Supabase） ---
  useEffect(() => {
    if (DEMO_MODE || !user) return;

    const fetchRecords = async () => {
      const [mealsRes, bodyRes, workoutsRes] = await Promise.all([
        supabase.from('meals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('body_stats').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('workouts').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      ]);

      if (mealsRes.error) console.error('Meal fetch error:', mealsRes.error);
      else setMealRecords((mealsRes.data || []).map(mapMeal));

      if (bodyRes.error) console.error('Body fetch error:', bodyRes.error);
      else setBodyRecords((bodyRes.data || []).map(mapBodyStat));

      if (workoutsRes.error) console.error('Workout fetch error:', workoutsRes.error);
      else setWorkoutRecords((workoutsRes.data || []).map(mapWorkout));
    };

    fetchRecords();
  }, [user]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        setImagePreview(dataUrl);
        setMemo('');
        analyzeMealImage(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const getUserContextForMealAnalysis = () => {
    const records = SAMPLE_DISPLAY ? SAMPLE_BODY_RECORDS : bodyRecords;
    const workouts = SAMPLE_DISPLAY ? SAMPLE_WORKOUT_RECORDS : workoutRecords;
    const recentBody = records[0];
    const prevBody = records[1];
    const weightTrend = recentBody && prevBody
      ? (recentBody.weight - prevBody.weight).toFixed(2)
      : null;
    const workoutCount = workouts.filter(r => {
      if (!r.createdAt) return false;
      const d = r.createdAt.toMillis ? new Date(r.createdAt.toMillis()) : new Date(r.createdAt);
      return d.getMonth() === new Date().getMonth();
    }).length;

    return {
      targetWeight: SAMPLE_DISPLAY ? SAMPLE_TARGET_WEIGHT : null,
      recentWeight: recentBody?.weight ?? null,
      recentBodyFat: recentBody?.bodyFat ?? null,
      recentMuscle: recentBody?.muscle ?? null,
      weightTrend,
      workoutsThisMonth: workoutCount,
      timing,
      memo: memo.trim() || null
    };
  };

  const analyzeMealImage = async (imageDataUrl) => {
    if (!imageDataUrl) return;
    setIsAnalyzing(true);
    setMealScore(null);
    setMealScoreComment('');
    setMealEatingOrder('');
    try {
      const ctx = getUserContextForMealAnalysis();
      const base64Data = imageDataUrl.split(',')[1];
      const mimeType = imageDataUrl.split(';')[0].split(':')[1];
      const promptText = `あなたはダイエットをサポートする栄養・トレーニングの専門家です。
以下の参考情報（サンプルデータを含む場合があります）と食事写真を総合的・客観的に評価し、今回提示された食事を100点満点で採点してください。

【参考情報】
- 目標体重: ${ctx.targetWeight ?? '未設定'}kg
- 最近の体重: ${ctx.recentWeight ?? '未記録'}kg
- 最近の体脂肪率: ${ctx.recentBodyFat ?? '未記録'}%
- 最近の筋肉量: ${ctx.recentMuscle ?? '未記録'}kg
- 前回比の体重変化: ${ctx.weightTrend != null ? `${ctx.weightTrend}kg` : '未記録'}
- 今月の運動回数: ${ctx.workoutsThisMonth}回
- 食事のタイミング: ${ctx.timing}
- ユーザーのメモ: ${ctx.memo ?? 'なし'}

【評価の観点】
- 健康的なダイエット・目標体重への適合度
- 栄養バランス（タンパク質・脂質・炭水化物）
- 量・カロリーの妥当性
- 食事タイミングとの相性
- 運動量・体組成の状況を踏まえた総合判断

【必須】
- eatingOrder には、写真に写っている食べ物を前提に「食べる順番」を必ず番号付きで具体的に書いてください（例：1. サラダ 2. 主菜のたんぱく質 3. ごはん）

必ず以下のJSON形式のみで回答してください（他の文字は含めない）:
{
  "score": 0から100の整数,
  "scoreComment": "点数の理由を1〜2文で客観的に",
  "eatingOrder": "番号付きで食べる順番（必須）",
  "analysis": "カロリー目安、栄養バランス、改善ポイントを簡潔に"
}`;

      const payload = {
        contents: [{
          role: "user",
          parts: [
            { text: promptText },
            { inlineData: { mimeType: mimeType, data: base64Data } }
          ]
        }]
      };
      const resultText = await callGeminiAPI(payload);
      const { score, scoreComment, eatingOrder, analysis } = parseMealAnalysisResponse(resultText);

      setMealScore(score);
      setMealScoreComment(scoreComment);
      setMealEatingOrder(eatingOrder);

      const scoreLine = score != null ? `【食事スコア】${score}点 / 100点\n${scoreComment ? scoreComment + '\n' : ''}` : '';
      const orderLine = eatingOrder ? `【食べる順番】\n${eatingOrder}\n\n` : '';
      const analysisBlock = `${scoreLine}${orderLine}【AI分析】\n${analysis}`;
      setMemo(analysisBlock);
    } catch (error) {
      console.error("AI Analysis Error:", error);
      alert("AIの分析に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAskCoach = async () => {
    setIsCoaching(true);
    try {
      const recentWeight = displayBodyRecords.length > 0 ? displayBodyRecords[0].weight : "データなし";
      const recentMuscle = displayBodyRecords.length > 0 ? displayBodyRecords[0].muscle : "データなし";
      const workoutCount = displayWorkoutRecords.filter(r => {
        if (!r.createdAt) return false;
        const d = r.createdAt.toMillis ? new Date(r.createdAt.toMillis()) : new Date(r.createdAt);
        return d.getMonth() === new Date().getMonth();
      }).length;

      const promptText = `
        参考情報（サンプルの場合があります）:
        目標体重: ${SAMPLE_DISPLAY ? SAMPLE_TARGET_WEIGHT : '未設定'}kg
        最近の体重: ${recentWeight}kg
        最近の筋肉量: ${recentMuscle}kg
        今月の運動回数: ${workoutCount}回
        
        上記を踏まえて、今日からまた頑張れるような励ましのメッセージと、食事や運動に関するワンポイントアドバイスを1つ教えてください。
      `;

      const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        systemInstruction: { parts: [{ text: "あなたはダイエットをサポートする、優しくてポジティブなプロのパーソナルトレーナーAIです。敬語で、親しみやすく、絵文字を交えて励ましてください。" }] }
      };

      const resultText = await callGeminiAPI(payload);
      setCoachMessage(resultText);
    } catch (error) {
      console.error("AI Coach Error:", error);
      setCoachMessage("ごめんなさい、今はうまく考えがまとまりません。後でもう一度話しかけてください！");
    } finally {
      setIsCoaching(false);
    }
  };

  const handleAddMeal = async () => {
    if (!imagePreview && !memo) { alert('写真かメモを入力してください。'); return; }
    if (SAMPLE_DISPLAY) {
      alert('サンプル表示中です。画面の記録一覧はデモ用の仮データです。食事のAI評価はお試しいただけます。');
      return;
    }
    if (!user) return;
    if (DEMO_MODE) {
      const rec = { id: 'm' + Date.now(), image: imagePreview, timing, memo, score: mealScore, scoreComment: mealScoreComment, eatingOrder: mealEatingOrder, createdAt: serverTimestamp() };
      setMealRecords(prev => [rec, ...prev]);
      setImagePreview(null); setMemo(''); setTiming('朝食'); setMealScore(null); setMealScoreComment(''); setMealEatingOrder('');
      [cameraInputRef, galleryInputRef].forEach(r => { if (r.current) r.current.value = ''; });
      return;
    }
    try {
      const { error } = await supabase.from('meals').insert({
        user_id: user.id,
        image: imagePreview,
        timing,
        memo,
        score: mealScore,
        score_comment: mealScoreComment,
        eating_order: mealEatingOrder
      });
      if (error) throw error;
      const { data } = await supabase.from('meals').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (data) setMealRecords(data.map(mapMeal));
      setImagePreview(null); setMemo(''); setTiming('朝食'); setMealScore(null); setMealScoreComment(''); setMealEatingOrder('');
      [cameraInputRef, galleryInputRef].forEach(r => { if (r.current) r.current.value = ''; });
    } catch (e) { console.error("Error adding document: ", e); }
  };

  const handleAddBodyRecord = async () => {
    if (!inputWeight) { alert('体重は入力必須です。'); return; }
    if (SAMPLE_DISPLAY) {
      alert('サンプル表示中です。体組成の保存はデモ用の仮データのみ表示しています。');
      setInputWeight(''); setInputBodyFat(''); setInputMuscle('');
      return;
    }
    if (!user) return;
    if (DEMO_MODE) {
      const rec = {
        id: 'b' + Date.now(),
        weight: parseFloat(inputWeight),
        bodyFat: inputBodyFat ? parseFloat(inputBodyFat) : null,
        muscle: inputMuscle ? parseFloat(inputMuscle) : null,
        createdAt: serverTimestamp()
      };
      setBodyRecords(prev => [rec, ...prev]);
      setInputWeight(''); setInputBodyFat(''); setInputMuscle('');
      return;
    }
    try {
      const { error } = await supabase.from('body_stats').insert({
        user_id: user.id,
        weight: parseFloat(inputWeight),
        body_fat: inputBodyFat ? parseFloat(inputBodyFat) : null,
        muscle: inputMuscle ? parseFloat(inputMuscle) : null
      });
      if (error) throw error;
      const { data } = await supabase.from('body_stats').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (data) setBodyRecords(data.map(mapBodyStat));
      setInputWeight(''); setInputBodyFat(''); setInputMuscle('');
    } catch (e) { console.error("Error adding document: ", e); }
  };

  const handleAddWorkout = async () => {
    if (SAMPLE_DISPLAY) {
      alert('サンプル表示中です。運動記録はデモ用の仮データのみ表示しています。');
      return;
    }
    if (!user) return;
    if (DEMO_MODE) {
      const rec = { id: 'w' + Date.now(), activity: 'カーブス', createdAt: serverTimestamp() };
      setWorkoutRecords(prev => [rec, ...prev]);
      return;
    }
    try {
      const { error } = await supabase.from('workouts').insert({
        user_id: user.id,
        activity: 'カーブス'
      });
      if (error) throw error;
      const { data } = await supabase.from('workouts').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (data) setWorkoutRecords(data.map(mapWorkout));
    } catch (e) { console.error("Error adding document: ", e); }
  };

  const handleDelete = async (id, tableName) => {
    if (SAMPLE_DISPLAY) return;
    if (!user) return;
    if (DEMO_MODE) {
      if (tableName === 'meals') setMealRecords(prev => prev.filter(r => r.id !== id));
      else if (tableName === 'body_stats') setBodyRecords(prev => prev.filter(r => r.id !== id));
      else if (tableName === 'workouts') setWorkoutRecords(prev => prev.filter(r => r.id !== id));
      return;
    }
    try {
      const { error } = await supabase.from(tableName).delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      if (tableName === 'meals') setMealRecords(prev => prev.filter(r => r.id !== id));
      else if (tableName === 'body_stats') setBodyRecords(prev => prev.filter(r => r.id !== id));
      else if (tableName === 'workouts') setWorkoutRecords(prev => prev.filter(r => r.id !== id));
    } catch (e) { console.error("Error deleting record: ", e); }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '記録中...';
    const d = timestamp.toMillis ? new Date(timestamp.toMillis()) : new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const getTimingIcon = (t) => {
    switch (t) {
      case '朝食': return <Sun className="w-5 h-5 text-orange-500" />;
      case '昼食': return <Utensils className="w-5 h-5 text-yellow-500" />;
      case '夕食': return <Moon className="w-5 h-5 text-indigo-500" />;
      case '間食': return <Coffee className="w-5 h-5 text-amber-700" />;
      default: return <Utensils className="w-5 h-5 text-gray-500" />;
    }
  };

  const latestWeight = displayBodyRecords.length > 0 ? displayBodyRecords[0].weight : null;
  const sampleRemainingWeight = SAMPLE_DISPLAY && latestWeight
    ? (latestWeight - SAMPLE_TARGET_WEIGHT).toFixed(1)
    : null;
  const currentMonth = new Date().getMonth();
  const workoutsThisMonth = displayWorkoutRecords.filter(r => {
    if (!r.createdAt) return false;
    const d = r.createdAt.toMillis ? new Date(r.createdAt.toMillis()) : new Date(r.createdAt);
    return d.getMonth() === currentMonth;
  }).length;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-orange-50 p-6">
        <div className="max-w-md text-center space-y-4">
          {authError ? (
            <>
              <p className="text-red-600 font-bold">接続エラー</p>
              <p className="text-sm text-gray-700 leading-relaxed">{authError}</p>
              <p className="text-xs text-gray-500">設定後、ページを再読み込みしてください。</p>
            </>
          ) : (
            <p className="text-gray-600">読み込み中...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-orange-50 font-sans text-gray-800 pb-20">
      {SAMPLE_DISPLAY && (
        <div className="bg-blue-50 border-b border-blue-200 p-3 text-sm text-blue-800">
          <strong>サンプル表示</strong> — 画面の体重・記録はデモ用の仮データです。人に見せても安心してください。
        </div>
      )}

      {DEMO_MODE && (
        <div className="bg-amber-50 border-b border-amber-200 p-3 text-sm text-amber-800">
          <strong>デモモード</strong> — ローカルでプレビュー中。Supabase・Gemini設定で本番利用可能。
        </div>
      )}

      {showPwaPrompt && (
        <div className="bg-blue-50 border-b border-blue-200 p-3 text-sm flex items-start gap-3 shadow-sm">
          <Smartphone className="w-8 h-8 text-blue-500 flex-shrink-0 mt-1" />
          <div>
            <p className="font-bold text-blue-800 mb-1">ホーム画面に追加してアプリ化！</p>
            <p className="text-blue-700 text-xs">
              ブラウザのメニュー「<Share className="w-3 h-3 inline text-blue-500 mx-1"/>共有」から「<b>ホーム画面に追加</b>」を選ぶと、専用アイコンが作れます！
            </p>
            <button onClick={() => setShowPwaPrompt(false)} className="mt-2 text-xs text-blue-500 underline">閉じる</button>
          </div>
        </div>
      )}

      <header className="bg-orange-500 text-white p-4 shadow-md sticky top-0 z-10">
        <div className="max-w-md mx-auto flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6" />
              <h1 className="text-xl font-bold tracking-wider">Myダイエット記録</h1>
            </div>
            <div className="bg-orange-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
              <Dumbbell className="w-3 h-3" /> 今月: {workoutsThisMonth}回
            </div>
          </div>
          <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
            <div className="flex justify-between items-end mb-1">
              <span className="text-sm font-medium">
                {SAMPLE_DISPLAY ? 'サンプル表示: ' : '現在: '}
                {latestWeight ? `${latestWeight}kg` : '- kg'}
              </span>
              {SAMPLE_DISPLAY && (
                <span className="text-xs">目標: {SAMPLE_TARGET_WEIGHT}kg</span>
              )}
            </div>
            {sampleRemainingWeight && (
              <p className="text-xs font-bold text-orange-100 flex items-center gap-1 mt-1">
                <TrendingDown className="w-4 h-4" /> 目標まであと {sampleRemainingWeight} kg！
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4">
        <div className="flex bg-white rounded-xl shadow-sm p-1 border border-orange-100 mb-4 overflow-x-auto">
          <button onClick={() => setActiveTab('meal')} className={`flex-1 min-w-[60px] py-2 text-xs font-bold rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${activeTab === 'meal' ? 'bg-orange-100 text-orange-700' : 'text-gray-400'}`}>
            <Camera className="w-4 h-4" /> 食事
          </button>
          <button onClick={() => setActiveTab('body')} className={`flex-1 min-w-[60px] py-2 text-xs font-bold rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${activeTab === 'body' ? 'bg-orange-100 text-orange-700' : 'text-gray-400'}`}>
            <Scale className="w-4 h-4" /> 体組成
          </button>
          <button onClick={() => setActiveTab('workout')} className={`flex-1 min-w-[60px] py-2 text-xs font-bold rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${activeTab === 'workout' ? 'bg-orange-100 text-orange-700' : 'text-gray-400'}`}>
            <Dumbbell className="w-4 h-4" /> 運動
          </button>
          <button onClick={() => setActiveTab('coach')} className={`flex-1 min-w-[60px] py-2 text-xs font-bold rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${activeTab === 'coach' ? 'bg-orange-100 text-orange-700' : 'text-gray-400'}`}>
            <Bot className="w-4 h-4" /> コーチ
          </button>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 space-y-6">
        {activeTab === 'meal' && (
          <section className="transition-opacity duration-300">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-orange-100 mb-6">
              <div className="space-y-4">
                <div className="border-2 border-dashed border-orange-200 rounded-xl bg-orange-50 flex flex-col items-center justify-center relative overflow-hidden" style={{ minHeight: imagePreview ? 'auto' : '140px' }}>
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" className="w-full h-auto object-cover max-h-64" />
                      {isAnalyzing && (
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
                          <Activity className="w-8 h-8 animate-spin mb-2" />
                          <p className="text-sm font-bold">AIが評価中...</p>
                        </div>
                      )}
                      {!isAnalyzing && mealScore != null && (
                        <div className={`absolute top-2 left-2 w-16 h-16 rounded-full border-4 flex items-center justify-center font-extrabold text-xl shadow-md ${getScoreStyle(mealScore).ring} ${getScoreStyle(mealScore).bg} ${getScoreStyle(mealScore).text}`}>
                          {mealScore}
                        </div>
                      )}
                      <div className="absolute bottom-2 right-2 flex gap-2">
                        <button type="button" onClick={() => cameraInputRef.current?.click()} className="bg-white/90 hover:bg-white text-orange-600 px-3 py-1.5 rounded-lg text-xs font-bold shadow flex items-center gap-1">
                          <Camera className="w-4 h-4" /> 撮り直す
                        </button>
                        <button type="button" onClick={() => galleryInputRef.current?.click()} className="bg-white/90 hover:bg-white text-orange-600 px-3 py-1.5 rounded-lg text-xs font-bold shadow flex items-center gap-1">
                          <ImagePlus className="w-4 h-4" /> 別の写真
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex gap-3 p-6">
                      <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 py-6 px-4 bg-white rounded-xl border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50 transition-colors">
                        <Camera className="w-10 h-10 text-orange-500" />
                        <span className="text-sm font-bold text-orange-600">写真を撮る</span>
                      </button>
                      <button type="button" onClick={() => galleryInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 py-6 px-4 bg-white rounded-xl border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50 transition-colors">
                        <ImagePlus className="w-10 h-10 text-orange-500" />
                        <span className="text-sm font-bold text-orange-600">アルバムから選ぶ</span>
                      </button>
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleImageChange} />
                  <input type="file" accept="image/*" className="hidden" ref={galleryInputRef} onChange={handleImageChange} />
                </div>
                {imagePreview && isAnalyzing && (
                  <p className="text-sm text-orange-600 font-medium text-center">写真を送りました。100点満点で評価しています...</p>
                )}
                {mealScore != null && !isAnalyzing && (
                  <MealScoreDisplay score={mealScore} comment={mealScoreComment} size="lg" />
                )}
                {mealEatingOrder && !isAnalyzing && (
                  <EatingOrderDisplay eatingOrder={mealEatingOrder} />
                )}
                <div className="flex justify-between gap-2">
                  {['朝食', '昼食', '夕食', '間食'].map(t => (
                    <button key={t} onClick={() => setTiming(t)} className={`flex-1 py-2 text-xs rounded-lg border font-bold transition-colors ${timing === t ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-200 text-gray-500'}`}>{t}</button>
                  ))}
                </div>
                <textarea placeholder="メモ（ご飯少なめ、など）※AI分析結果もここに入ります" className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-300 text-sm resize-none bg-gray-50 min-h-[100px]" value={memo} onChange={(e) => setMemo(e.target.value)} />
                <button onClick={handleAddMeal} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2">
                  <PlusCircle className="w-5 h-5" /> 保存する
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {displayMealRecords.map(record => (
                <div key={record.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
                  <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                    <div className="flex items-center gap-2">
                      {getTimingIcon(record.timing)} <span className="font-bold text-gray-700">{record.timing}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{formatDate(record.createdAt)}</span>
                      {!record.isSample && (
                        <button onClick={() => handleDelete(record.id, 'meals')} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                  {record.image && (
                    <div className="relative">
                      <img src={record.image} alt="Meal" className="w-full h-40 object-cover rounded-xl" />
                      {record.score != null && (
                        <div className={`absolute top-2 right-2 w-14 h-14 rounded-full border-4 flex items-center justify-center font-extrabold text-lg shadow-md ${getScoreStyle(record.score).ring} ${getScoreStyle(record.score).bg} ${getScoreStyle(record.score).text}`}>
                          {record.score}
                        </div>
                      )}
                    </div>
                  )}
                  {record.score != null && (
                    <MealScoreDisplay score={record.score} comment={record.scoreComment} size="sm" />
                  )}
                  {record.eatingOrder && (
                    <EatingOrderDisplay eatingOrder={record.eatingOrder} />
                  )}
                  {record.memo && <p className="text-gray-600 text-sm whitespace-pre-wrap">{record.memo}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'body' && (
          <section className="transition-opacity duration-300">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-orange-100 mb-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">体重 (kg) *</label>
                  <input type="number" step="0.1" value={inputWeight} onChange={(e) => setInputWeight(e.target.value)} placeholder="例: 55.0" className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-300 text-lg font-bold bg-gray-50" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 mb-1">体脂肪率 (%)</label>
                    <input type="number" step="0.1" value={inputBodyFat} onChange={(e) => setInputBodyFat(e.target.value)} placeholder="例: 28.0" className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-300 font-bold bg-gray-50" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 mb-1">筋肉量 (kg)</label>
                    <input type="number" step="0.1" value={inputMuscle} onChange={(e) => setInputMuscle(e.target.value)} placeholder="例: 24.0" className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-300 font-bold bg-gray-50" />
                  </div>
                </div>
                <button onClick={handleAddBodyRecord} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-2">
                  <PlusCircle className="w-5 h-5" /> 保存する
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {displayBodyRecords.map((record, index) => {
                const prevRecord = displayBodyRecords[index + 1];
                const weightDiff = prevRecord ? (record.weight - prevRecord.weight).toFixed(2) : 0;
                const isSampleData = record.isSample;
                return (
                  <div key={record.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{formatDate(record.createdAt)}</span>
                      {!isSampleData && (
                        <button onClick={() => handleDelete(record.id, 'body_stats')} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      )}
                      {isSampleData && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">サンプル</span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center divide-x divide-gray-100">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">体重</p>
                        <p className="text-xl font-extrabold text-gray-800">{record.weight}<span className="text-sm font-medium text-gray-500 ml-1">kg</span></p>
                        {prevRecord && <p className={`text-xs font-bold mt-1 ${weightDiff > 0 ? 'text-red-400' : weightDiff < 0 ? 'text-blue-500' : 'text-gray-400'}`}>{weightDiff > 0 ? '▲' : weightDiff < 0 ? '▼' : '±'}{Math.abs(weightDiff)}kg</p>}
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">体脂肪率</p>
                        <p className="text-lg font-bold text-gray-700">{record.bodyFat || '-'}<span className="text-xs font-medium text-gray-500 ml-1">%</span></p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">筋肉量</p>
                        <p className="text-lg font-bold text-gray-700">{record.muscle || '-'}<span className="text-xs font-medium text-gray-500 ml-1">kg</span></p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === 'workout' && (
          <section className="transition-opacity duration-300">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-orange-100 mb-6 text-center">
              <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Dumbbell className="w-10 h-10 text-orange-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">今日もカーブスで<br/>頑張りましたか？</h2>
              <button onClick={handleAddWorkout} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 text-lg mt-6">
                <CheckCircle2 className="w-6 h-6" /> カーブスに行った！
              </button>
            </div>
            <div className="space-y-3">
              {displayWorkoutRecords.map(record => (
                <div key={record.id} className="bg-white rounded-xl p-4 shadow-sm border border-orange-200 flex justify-between items-center border-l-4 border-l-orange-500">
                  <div className="flex items-center gap-3">
                    <div className="bg-orange-100 p-2 rounded-full"><Dumbbell className="w-5 h-5 text-orange-600" /></div>
                    <div>
                      <p className="font-bold text-gray-800">{record.activity}</p>
                      <p className="text-xs text-gray-500">{formatDate(record.createdAt)}</p>
                    </div>
                  </div>
                  <button onClick={() => !record.isSample && handleDelete(record.id, 'workouts')} className={`transition-colors p-2 ${record.isSample ? 'invisible' : 'text-gray-300 hover:text-red-500'}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'coach' && (
          <section className="transition-opacity duration-300">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-orange-100 mb-6">
              <div className="flex items-center gap-3 mb-4 border-b border-orange-50 pb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full flex items-center justify-center shadow-inner">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">AIパーソナルコーチ</h2>
                  <p className="text-xs text-gray-500">あなたの記録を見てアドバイスします！</p>
                </div>
              </div>
              {coachMessage ? (
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed relative">
                  <div className="absolute top-[-8px] left-6 w-4 h-4 bg-orange-50 border-t border-l border-orange-100 transform rotate-45"></div>
                  {coachMessage}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400">
                  <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">ボタンを押すと、最近の記録から<br/>あなた専用のアドバイスを作成します。</p>
                </div>
              )}
              <button onClick={handleAskCoach} disabled={isCoaching}
                className="w-full mt-6 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70">
                {isCoaching ? <span className="flex items-center gap-2">考え中... <Activity className="w-5 h-5 animate-spin" /></span> : <>✨ コーチにアドバイスをもらう</>}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
