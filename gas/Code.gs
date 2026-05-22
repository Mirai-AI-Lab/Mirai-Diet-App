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

  try {
    const response = UrlFetchApp.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey,
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
    const json = JSON.parse(response.getContentText());
    const advice = (json.candidates && json.candidates[0] && json.candidates[0].content
      && json.candidates[0].content.parts && json.candidates[0].content.parts[0]
      && json.candidates[0].content.parts[0].text)
      || "アドバイスを生成できませんでした。";
    return { advice: advice };
  } catch (err) {
    console.error("Gemini API エラー:", err);
    return { advice: "AI分析に一時的な問題が発生しました。しばらく経ってから再試行してください。" };
  }
}
