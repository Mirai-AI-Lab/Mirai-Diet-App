/**
 * ダイエット健康管理アプリ GAS（Phase 1）
 * 仕様書: 仕様書/ダイエット健康管理アプリ_仕様書.md
 *
 * セットアップ:
 * 1. 下の SHEET_ID / DRIVE_FOLDER_ID を自分の値に差し替え
 * 2. スクリプトプロパティに GEMINI_API_KEY を設定（AI分析用・Phase 1後半でも可）
 * 3. ウェブアプリとしてデプロイ
 */

const SHEET_ID = "1qBeXxm7RB92YuimEN4gfWeRo3IDalTI7ZfqwNC090bg";
const DRIVE_FOLDER_ID = "1WySdeyLYUyyg27S335cOw22qFyeBV3Le";

function getGeminiApiKey() {
  return PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
}

var GEMINI_MODEL = "gemini-2.5-flash";

function callGeminiText_(prompt) {
  var apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY が未設定です" };
  }

  var url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + GEMINI_MODEL + ":generateContent?key=" + apiKey;

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  var status = response.getResponseCode();
  var body = response.getContentText();

  if (status !== 200) {
    console.error("Gemini API HTTP " + status + ": " + body);
    return { ok: false, error: "HTTP " + status };
  }

  var json = JSON.parse(body);
  var text = json.candidates && json.candidates[0] && json.candidates[0].content
    && json.candidates[0].content.parts && json.candidates[0].content.parts[0]
    && json.candidates[0].content.parts[0].text;

  if (!text) {
    console.error("Gemini API 空レスポンス: " + body);
    return { ok: false, error: "empty_response" };
  }

  return { ok: true, text: text };
}

/** Apps Script で接続テスト: testGeminiConnection を実行 */
function testGeminiConnection() {
  var result = callGeminiText_("こんにちは。1文だけ返してください。");
  if (result.ok) {
    Logger.log("OK: " + result.text);
    return result;
  }
  Logger.log("NG: " + result.error);
  return result;
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const { action, data } = body;

  let result;
  switch (action) {
    case "register":
      result = registerUser(data);
      break;
    case "getUsers":
      result = getUsers();
      break;
    case "uploadRecord":
      result = uploadRecord(data);
      break;
    case "getRecords":
      result = getRecords();
      break;
    case "getAIAdvice":
      result = getAIAdvice(data);
      break;
    default:
      result = { status: "error", message: "Unknown action" };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function registerUser(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName("ユーザー");
  if (!sheet) {
    sheet = ss.insertSheet("ユーザー");
    sheet.appendRow(["lineId", "name", "createdAt"]);
  }
  const values = sheet.getDataRange().getValues();
  const exists = values.some(function (row) { return row[0] === data.userId; });
  if (!exists) {
    sheet.appendRow([data.userId, data.displayName, new Date().toISOString()]);
  }
  return { status: "success" };
}

function getUsers() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("ユーザー");
  if (!sheet) return { result: [] };
  const values = sheet.getDataRange().getValues().slice(1);
  return {
    result: values.map(function (r) {
      return { lineId: r[0], name: r[1] };
    })
  };
}

function uploadRecord(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName("記録");
  if (!sheet) {
    sheet = ss.insertSheet("記録");
    sheet.appendRow([
      "date", "lineId", "userName", "recordType", "subType",
      "weight", "bodyFat", "muscleMass", "visceralFat",
      "duration", "distance", "memo", "imageUrls", "createdAt"
    ]);
  }

  var imageUrls = [];
  if (data.imageBlobs && data.imageBlobs.length > 0) {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    data.imageBlobs.forEach(function (blob, i) {
      try {
        var base64Data = blob.replace(/^data:image\/(png|jpeg|jpg|gif|webp);base64,/, "");
        var byteArray = Utilities.base64Decode(base64Data);
        var file = folder.createFile(
          Utilities.newBlob(byteArray, "image/jpeg", "diet_" + Date.now() + "_" + i + ".jpg")
        );
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        imageUrls.push("https://drive.google.com/uc?export=view&id=" + file.getId());
      } catch (err) {
        console.error("画像アップロードエラー:", err);
      }
    });
  }

  var ex = data.extraData || {};
  sheet.appendRow([
    data.date,
    data.lineId,
    data.userName,
    data.recordType,
    data.subType || "",
    ex.weight !== null && ex.weight !== undefined ? ex.weight : "",
    ex.bodyFat !== null && ex.bodyFat !== undefined ? ex.bodyFat : "",
    ex.muscleMass !== null && ex.muscleMass !== undefined ? ex.muscleMass : "",
    ex.visceralFat !== null && ex.visceralFat !== undefined ? ex.visceralFat : "",
    ex.duration !== null && ex.duration !== undefined ? ex.duration : "",
    ex.distance !== null && ex.distance !== undefined ? ex.distance : "",
    data.memo || "",
    imageUrls.join(","),
    new Date().toISOString()
  ]);

  return { status: "success" };
}

function getRecords() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("記録");
  if (!sheet) return { result: [] };

  const values = sheet.getDataRange().getValues().slice(1);
  const result = values.map(function (r) {
    return {
      date: r[0] instanceof Date ? Utilities.formatDate(r[0], "Asia/Tokyo", "yyyy-MM-dd") : r[0],
      lineId: r[1],
      userName: r[2],
      recordType: r[3],
      subType: r[4],
      extraData: {
        weight: r[5] !== "" ? Number(r[5]) : null,
        bodyFat: r[6] !== "" ? Number(r[6]) : null,
        muscleMass: r[7] !== "" ? Number(r[7]) : null,
        visceralFat: r[8] !== "" ? Number(r[8]) : null,
        duration: r[9] !== "" ? Number(r[9]) : null,
        distance: r[10] !== "" ? Number(r[10]) : null
      },
      memo: r[11],
      imageUrls: r[12] ? r[12].split(",").filter(function (u) { return u; }) : []
    };
  });

  return { result: result };
}

function getAIAdvice(data) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      advice: "AI分析の準備中です。GASのスクリプトプロパティに GEMINI_API_KEY を設定してください。"
    };
  }

  const records = data.recentRecords || [];
  let context = "以下は直近の健康記録データです:\n\n";
  records.forEach(function (r) {
    if (r.recordType === "体重") {
      const w = r.extraData && r.extraData.weight ? "体重 " + r.extraData.weight + "kg" : "";
      const bf = r.extraData && r.extraData.bodyFat ? "体脂肪率 " + r.extraData.bodyFat + "%" : "";
      const mm = r.extraData && r.extraData.muscleMass ? "筋肉量 " + r.extraData.muscleMass + "kg" : "";
      context += "[" + r.date + "] 体重測定: " + [w, bf, mm].filter(Boolean).join(", ") + "\n";
    } else if (r.recordType === "運動") {
      const dur = r.extraData && r.extraData.duration ? r.extraData.duration + "分" : "";
      const dist = r.extraData && r.extraData.distance ? r.extraData.distance + "km" : "";
      context += "[" + r.date + "] 運動: " + r.subType + " " + [dur, dist].filter(Boolean).join(" ") + "\n";
    } else if (r.recordType === "食事") {
      context += "[" + r.date + "] 食事(" + r.subType + "): " + (r.memo || "写真のみ") + "\n";
    } else if (r.recordType === "お通じ") {
      context += "[" + r.date + "] お通じ: " + r.subType + "\n";
    }
  });

  const prompt = "あなたはダイエットと健康管理の専門家AIです。\n"
    + "以下の健康記録を分析し、具体的で実践的なアドバイスを提供してください。\n\n"
    + context + "\n"
    + "親しみやすく励ます口調で、400文字以内でまとめてください。";

  var result = callGeminiText_(prompt);
  if (result.ok) {
    return { advice: result.text };
  }

  console.error("Gemini API エラー:", result.error);
  return { advice: "AI分析に一時的な問題が発生しました。GASの Code.gs を最新版に更新し、testGeminiConnection を実行して確認してください。" };
}

// =========================================
// デモ用サンプルデータ（お披露目 → 後で削除）
// Apps Script エディタで seedDemoData() を実行
// =========================================

var DEMO_TAG = "【デモ】";

function ensureRecordSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("記録");
  if (!sheet) {
    sheet = ss.insertSheet("記録");
    sheet.appendRow([
      "date", "lineId", "userName", "recordType", "subType",
      "weight", "bodyFat", "muscleMass", "visceralFat",
      "duration", "distance", "memo", "imageUrls", "createdAt"
    ]);
  }
  return sheet;
}

function getSeedTargetUser_() {
  // 特定ユーザーのみ入れたいときは lineId を指定（空なら「ユーザー」シート先頭）
  var overrideLineId = "";
  var overrideName = "デモユーザー";

  if (overrideLineId) {
    return { lineId: overrideLineId, name: overrideName };
  }

  var users = getUsers().result || [];
  if (users.length === 0) {
    throw new Error("ユーザーが未登録です。先にスマホからアプリを1回開いてください。");
  }
  return { lineId: users[0].lineId, name: users[0].name };
}

function formatDateYmd_(date) {
  return Utilities.formatDate(date, "Asia/Tokyo", "yyyy-MM-dd");
}

function appendDemoRow_(sheet, row) {
  sheet.appendRow([
    row.date,
    row.lineId,
    row.userName,
    row.recordType,
    row.subType || "",
    row.weight !== undefined && row.weight !== null ? row.weight : "",
    row.bodyFat !== undefined && row.bodyFat !== null ? row.bodyFat : "",
    row.muscleMass !== undefined && row.muscleMass !== null ? row.muscleMass : "",
    row.visceralFat !== undefined && row.visceralFat !== null ? row.visceralFat : "",
    row.duration !== undefined && row.duration !== null ? row.duration : "",
    row.distance !== undefined && row.distance !== null ? row.distance : "",
    DEMO_TAG + (row.memo || ""),
    "",
    new Date().toISOString()
  ]);
}

/**
 * お披露目用のダミーデータを約3週間分投入（体重は58kg前後）
 * 実行: Apps Script → 関数 seedDemoData → 実行
 */
function seedDemoData() {
  var user = getSeedTargetUser_();
  var sheet = ensureRecordSheet_();
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var weights = [
    59.2, 59.0, 58.8, 58.9, 58.7,
    58.6, 58.5, 58.4, 58.6, 58.3,
    58.2, 58.1, 58.0, 58.2, 57.9,
    58.1, 58.0, 58.3, 58.2, 58.1, 58.0
  ];

  var count = 0;

  for (var i = weights.length - 1; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - (weights.length - 1 - i));
    var dateStr = formatDateYmd_(d);
    var w = weights[i];
    var bodyFat = Math.round((25.8 - (weights.length - 1 - i) * 0.04) * 10) / 10;
    var muscle = Math.round((37.8 + (weights.length - 1 - i) * 0.015) * 10) / 10;
    var visceral = i % 3 === 0 ? 8 : (i % 3 === 1 ? 7.5 : 8.5);

    appendDemoRow_(sheet, {
      date: dateStr,
      lineId: user.lineId,
      userName: user.name,
      recordType: "体重",
      subType: "朝計測",
      weight: w,
      bodyFat: bodyFat,
      muscleMass: muscle,
      visceralFat: visceral,
      memo: "朝の計測（サンプル）"
    });
    count++;

    appendDemoRow_(sheet, {
      date: dateStr,
      lineId: user.lineId,
      userName: user.name,
      recordType: "お通じ",
      subType: i % 5 === 0 ? "なし" : "あり",
      memo: ""
    });
    count++;

    if (i % 2 === 0) {
      appendDemoRow_(sheet, {
        date: dateStr,
        lineId: user.lineId,
        userName: user.name,
        recordType: "食事",
        subType: "朝食",
        memo: "プロテイン、バナナ"
      });
      count++;
    }
    if (i % 3 === 0) {
      appendDemoRow_(sheet, {
        date: dateStr,
        lineId: user.lineId,
        userName: user.name,
        recordType: "食事",
        subType: "昼食",
        memo: "サラダチキン、野菜スープ"
      });
      count++;
    }
    if (i % 4 === 1) {
      appendDemoRow_(sheet, {
        date: dateStr,
        lineId: user.lineId,
        userName: user.name,
        recordType: "食事",
        subType: "夕食",
        memo: "焼き魚、味噌汁、小盛りごはん"
      });
      count++;
    }
    if (i % 3 === 1) {
      appendDemoRow_(sheet, {
        date: dateStr,
        lineId: user.lineId,
        userName: user.name,
        recordType: "運動",
        subType: i % 6 === 1 ? "ジム（筋トレ）" : "ウォーキング",
        duration: i % 6 === 1 ? 60 : 40,
        distance: i % 6 === 1 ? "" : 3.2,
        memo: i % 6 === 1 ? "スクワット、腹筋" : "近所を歩く"
      });
      count++;
    }
  }

  Logger.log("デモデータ投入完了: " + count + "件（ユーザー: " + user.name + "）");
  return { status: "success", count: count, user: user };
}

/**
 * 【デモ】タグ付きの行だけ削除（本番データは残る想定）
 * 実行: Apps Script → 関数 clearDemoData → 実行
 */
function clearDemoData() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("記録");
  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log("削除対象なし");
    return { status: "success", deleted: 0 };
  }

  var values = sheet.getDataRange().getValues();
  var kept = [values[0]];
  var deleted = 0;

  for (var i = 1; i < values.length; i++) {
    var memo = String(values[i][11] || "");
    if (memo.indexOf(DEMO_TAG) === 0) {
      deleted++;
    } else {
      kept.push(values[i]);
    }
  }

  sheet.clearContents();
  if (kept.length > 0) {
    sheet.getRange(1, 1, kept.length, kept[0].length).setValues(kept);
  }

  Logger.log("デモデータ削除完了: " + deleted + "件");
  return { status: "success", deleted: deleted };
}
