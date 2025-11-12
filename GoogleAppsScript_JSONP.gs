// EGChem FACSYS 점검 시스템 - JSONP 지원 Google Apps Script 웹앱
// 이 코드를 Google Apps Script에 복사하여 웹앱으로 배포하세요

function doGet(e) {
  try {
    const action = e.parameter.action || 'testConnection';
    const callback = e.parameter.callback || 'callback';
    
    Logger.log('액션:', action);
    Logger.log('파라미터:', e.parameter);
    
    let result;
    switch(action) {
      case 'testConnection':
        result = testConnection();
        break;
      case 'addInspectionData':
        const sheetName = e.parameter.sheetName || '1-A';
        const dataStr = e.parameter.data;
        let data;
        try {
          data = JSON.parse(dataStr);
        } catch (error) {
          data = dataStr.split(',');
        }
        result = addInspectionData(sheetName, data);
        break;
      case 'getEquipment':
        const type = e.parameter.type || '';
        Logger.log('getEquipment 호출, type:', type);
        result = getEquipment('1-A', type);
        break;
      case 'addEquipment':
        Logger.log('addEquipment 호출');
        result = addEquipment('1-A', e.parameter.type, e.parameter.name);
        break;
      case 'deleteEquipment':
        Logger.log('deleteEquipment 호출');
        result = deleteEquipment('1-A', e.parameter.type, e.parameter.name);
        break;
      case 'getInspectionItems':
        Logger.log('getInspectionItems 호출');
        result = getInspectionItems(e.parameter.type);
        break;
      case 'addInspectionItem':
        Logger.log('addInspectionItem 호출');
        result = addInspectionItem(e.parameter.type, e.parameter.itemName);
        break;
      case 'deleteInspectionItem':
        Logger.log('deleteInspectionItem 호출');
        result = deleteInspectionItem(e.parameter.type, e.parameter.itemName);
        break;
      case 'updateLastInspectionDate':
        Logger.log('updateLastInspectionDate 호출');
        result = updateLastInspectionDate('1-A', e.parameter.type, e.parameter.name);
        break;
      case 'getLastInspectionDate':
        Logger.log('getLastInspectionDate 호출');
        result = getLastInspectionDate('1-A', e.parameter.type, e.parameter.name);
        break;
      default:
        Logger.log('알 수 없는 액션:', action);
        result = {
          success: false,
          error: '알 수 없는 액션: ' + action
        };
    }
    
    Logger.log('결과:', result);
    
    // JSONP 응답 반환
    return ContentService.createTextOutput(`${callback}(${JSON.stringify(result)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
      
  } catch (error) {
    Logger.error('오류 발생:', error);
    const callback = e.parameter.callback || 'callback';
    return ContentService.createTextOutput(`${callback}(${JSON.stringify({
      success: false,
      error: error.toString()
    })})`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

function doPost(e) {
  // POST 요청도 JSONP로 응답
  return doGet(e);
}

function testConnection() {
  try {
    // 스프레드시트 ID (기존 프로그램과 동일)
    const spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
    
    // 스프레드시트 열기
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    // "1-A" 시트 확인
    const sheet = spreadsheet.getSheetByName('1-A');
    if (!sheet) {
      throw new Error('1-A 시트를 찾을 수 없습니다.');
    }
    
    return {
      success: true,
      message: '구글 시트 연결 성공',
      spreadsheetId: spreadsheetId,
      sheetName: '1-A'
    };
    
  } catch (error) {
    console.error('연결 테스트 실패:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

function addInspectionData(sheetName, rowData) {
  try {
    // 스프레드시트 ID (기존 프로그램과 동일)
    const spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
    
    // 스프레드시트 열기
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    // 시트 가져오기 (없으면 생성)
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
      
      // 헤더 행 추가 (기존 프로그램과 동일한 형식)
      const headers = ['날짜', '점검유형', '장비명', '설치위치', '점검자', '점검내용', '특이사항'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    // 데이터 추가 (기존 프로그램과 동일한 형식)
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);
    
    console.log('점검 데이터 저장 완료:', rowData);
    
    return {
      success: true,
      message: '점검 데이터 저장 완료',
      rowNumber: lastRow + 1,
      data: rowData
    };
    
  } catch (error) {
    console.error('데이터 저장 실패:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// 장비 목록 가져오기 (1-A 시트에서 점검 기록을 기반으로 추출)
function getEquipment(sheetName, type) {
  try {
    const spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    // 1-A 시트에서 장비 목록 추출
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log('시트를 찾을 수 없습니다: ' + sheetName);
      return {
        success: true,
        data: []
      };
    }
    
    const data = sheet.getDataRange().getValues();
    Logger.log('전체 데이터 행 수: ' + data.length);
    Logger.log('요청한 점검 유형: ' + type);
    
    if (data.length <= 1) {
      // 헤더만 있거나 데이터가 없으면 빈 배열 반환
      Logger.log('데이터가 없습니다 (헤더만 있음)');
      return {
        success: true,
        data: []
      };
    }
    
    // 장비별로 가장 최근 점검 날짜를 저장할 맵
    // 키: 장비명, 값: { date: 날짜 문자열 (YYYY-MM-DD), dateObj: Date 객체 }
    const equipmentMap = new Map();
    let processedCount = 0;
    
    // 1-A 시트 구조: 날짜 | 점검유형 | 장비명 | 설치위치 | 점검자 | 점검내용 | 특이사항
    // 첫 번째 행은 헤더이므로 2번째 행부터 확인 (인덱스 1부터)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const inspectionType = String(row[1] || '').trim();  // B열: 점검유형 (문자열로 변환)
      const equipmentName = String(row[2] || '').trim();   // C열: 장비명 (문자열로 변환)
      const dateValue = row[0];                            // A열: 날짜 (Date 객체 또는 문자열)
      
      // 빈 행은 건너뛰기
      if (!equipmentName || !inspectionType) {
        continue;
      }
      
      // 점검 유형이 일치하는지 확인
      if (inspectionType !== type) {
        continue;
      }
      
      processedCount++;
      
      // 날짜를 YYYY-MM-DD 형식의 문자열로 변환
      let dateStr = null;
      let dateObj = null;
      
      if (dateValue) {
        try {
          // Google Sheets에서 Date 객체로 반환될 수 있음
          // Utilities.formatDate를 사용하여 안정적으로 YYYY-MM-DD 형식으로 변환
          if (dateValue instanceof Date) {
            dateObj = dateValue;
            // Utilities.formatDate를 사용하여 YYYY-MM-DD 형식으로 변환
            dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          } else if (typeof dateValue === 'string') {
            // 문자열인 경우
            dateStr = dateValue.trim();
            // 날짜 파싱 시도
            dateObj = new Date(dateStr);
            if (isNaN(dateObj.getTime())) {
              // 파싱 실패 시 원본 문자열 유지
              dateObj = null;
            } else {
              // 성공하면 Utilities.formatDate를 사용하여 YYYY-MM-DD 형식으로 정규화
              dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
            }
          } else if (typeof dateValue === 'number') {
            // 숫자인 경우 (시리얼 날짜 - Excel 형식)
            // Excel 시리얼 날짜는 1900-01-01부터의 일수
            dateObj = new Date((dateValue - 25569) * 86400 * 1000);
            dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          }
        } catch (e) {
          Logger.log('날짜 변환 오류 (행 ' + (i+1) + '): ' + e.toString());
          dateStr = null;
          dateObj = null;
        }
      }
      
      // 이미 저장된 장비가 없거나, 더 최근 날짜이면 업데이트
      if (!equipmentMap.has(equipmentName)) {
        equipmentMap.set(equipmentName, {
          date: dateStr,
          dateObj: dateObj
        });
        Logger.log('장비 추가: ' + equipmentName + ', 날짜: ' + dateStr);
      } else {
        const existing = equipmentMap.get(equipmentName);
        // 날짜 비교 (더 최근 날짜로 업데이트)
        if (dateObj && existing.dateObj) {
          if (dateObj > existing.dateObj) {
            equipmentMap.set(equipmentName, {
              date: dateStr,
              dateObj: dateObj
            });
            Logger.log('장비 날짜 업데이트: ' + equipmentName + ', 날짜: ' + dateStr);
          }
        } else if (dateObj && !existing.dateObj) {
          // 기존에는 날짜가 없고 새로운 것에 날짜가 있으면 업데이트
          equipmentMap.set(equipmentName, {
            date: dateStr,
            dateObj: dateObj
          });
          Logger.log('장비 날짜 추가: ' + equipmentName + ', 날짜: ' + dateStr);
        }
      }
    }
    
    Logger.log('처리된 행 수: ' + processedCount);
    Logger.log('추출된 장비 수: ' + equipmentMap.size);
    
    // Map을 배열로 변환
    const equipmentList = [];
    equipmentMap.forEach((value, equipmentName) => {
      equipmentList.push({
        name: equipmentName,
        status: 'normal',
        statusText: '정상',
        lastInspectionDate: value.date || null  // 마지막 점검 날짜 (YYYY-MM-DD 형식)
      });
    });
    
    // 장비명으로 정렬
    equipmentList.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
    
    Logger.log('반환할 장비 목록: ' + JSON.stringify(equipmentList.map(e => e.name)));
    
    return {
      success: true,
      data: equipmentList
    };
    
  } catch (error) {
    Logger.log('장비 목록 가져오기 실패: ' + error.toString());
    Logger.log('스택 트레이스: ' + error.stack);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// 장비 추가 (시트별 + 점검유형별)
function addEquipment(sheetName, type, name) {
  try {
    const spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    let sheet = spreadsheet.getSheetByName('Equipment');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('Equipment');
      // 헤더 추가: 시트명 | 점검유형 | 장비명 | 상태 | 상태텍스트 | 마지막점검일
      const headers = ['시트명', '점검유형', '장비명', '상태', '상태텍스트', '마지막점검일'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    // 장비 추가 (마지막 점검일은 비어있음)
    sheet.appendRow([sheetName, type, name, 'normal', '정상', '']);
    
    return {
      success: true,
      message: '장비 추가 완료'
    };
    
  } catch (error) {
    console.error('장비 추가 실패:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// 장비 삭제 (시트별 + 점검유형별)
function deleteEquipment(sheetName, type, name) {
  try {
    const spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    let sheet = spreadsheet.getSheetByName('Equipment');
    if (!sheet) {
      return {
        success: false,
        error: 'Equipment 시트를 찾을 수 없습니다.'
      };
    }
    
    const data = sheet.getDataRange().getValues();
    let rowToDelete = -1;
    
    // 삭제할 행 찾기 (시트명, 점검유형, 장비명 모두 일치)
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === sheetName && data[i][1] === type && data[i][2] === name) {
        rowToDelete = i + 1; // 시트는 1부터 시작
        break;
      }
    }
    
    if (rowToDelete === -1) {
      return {
        success: false,
        error: '해당 장비를 찾을 수 없습니다.'
      };
    }
    
    // 행 삭제
    sheet.deleteRow(rowToDelete);
    
    return {
      success: true,
      message: '장비 삭제 완료'
    };
    
  } catch (error) {
    console.error('장비 삭제 실패:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// 점검 항목 가져오기
function getInspectionItems(type) {
  try {
    const spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    let sheet = spreadsheet.getSheetByName('InspectionItems');
    if (!sheet) {
      // InspectionItems 시트가 없으면 기본 데이터 반환
      return {
        success: true,
        data: getDefaultInspectionItems(type)
      };
    }
    
    const data = sheet.getDataRange().getValues();
    const items = [];
    
    // 첫 번째 행은 헤더이므로 1부터 시작
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] === type) {
        items.push(row[1] || '');
      }
    }
    
    // 기본 데이터가 없으면 기본값 반환
    if (items.length === 0) {
      items.push(...getDefaultInspectionItems(type));
    }
    
    return {
      success: true,
      data: items
    };
    
  } catch (error) {
    console.error('점검 항목 가져오기 실패:', error);
    return {
      success: true,
      data: getDefaultInspectionItems(type)
    };
  }
}

// 기본 점검 항목 반환
function getDefaultInspectionItems(type) {
  const defaults = {
    '일일점검': ['오일교체', '누유점검', '모터점검', '외부수리'],
    '주간점검': ['전체점검', '정밀점검', '교체점검', '예방정비'],
    '월간점검': ['종합점검', '성능점검', '안전점검', '정기교체'],
    '분기점검': ['전면점검', '부품교체', '성능측정', '안전확인'],
    '반기점검': ['대점검', '주요부품교체', '성능개선', '안전강화'],
    '연간점검': ['오버홀', '시설개선', '성능업그레이드', '안전시설점검']
  };
  
  return defaults[type] || defaults['일일점검'];
}

// 점검 항목 추가
function addInspectionItem(type, itemName) {
  try {
    const spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    let sheet = spreadsheet.getSheetByName('InspectionItems');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('InspectionItems');
      // 헤더 추가
      const headers = ['점검유형', '점검항목'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    // 점검 항목 추가
    sheet.appendRow([type, itemName]);
    
    return {
      success: true,
      message: '점검 항목 추가 완료'
    };
    
  } catch (error) {
    console.error('점검 항목 추가 실패:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// 점검 항목 삭제
function deleteInspectionItem(type, itemName) {
  try {
    const spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    let sheet = spreadsheet.getSheetByName('InspectionItems');
    if (!sheet) {
      return {
        success: false,
        error: 'InspectionItems 시트를 찾을 수 없습니다.'
      };
    }
    
    const data = sheet.getDataRange().getValues();
    let rowToDelete = -1;
    
    // 삭제할 행 찾기
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === type && data[i][1] === itemName) {
        rowToDelete = i + 1; // 시트는 1부터 시작
        break;
      }
    }
    
    if (rowToDelete === -1) {
      return {
        success: false,
        error: '해당 점검 항목을 찾을 수 없습니다.'
      };
    }
    
    // 행 삭제
    sheet.deleteRow(rowToDelete);
    
    return {
      success: true,
      message: '점검 항목 삭제 완료'
    };
    
  } catch (error) {
    console.error('점검 항목 삭제 실패:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// 마지막 점검 날짜 조회 (1-A 시트에서 가장 최근 점검 기록 찾기)
function getLastInspectionDate(sheetName, type, name) {
  try {
    const spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    // 1-A 시트에서 점검 기록 확인
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log('시트를 찾을 수 없습니다: ' + sheetName);
      return {
        success: true,
        date: null
      };
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      // 헤더만 있거나 데이터가 없으면 null 반환
      Logger.log('데이터가 없습니다');
      return {
        success: true,
        date: null
      };
    }
    
    Logger.log('마지막 점검일 조회 - 점검유형: ' + type + ', 장비명: ' + name);
    
    let lastDate = null;
    let lastDateObj = null;
    
    // 1-A 시트 구조: 날짜 | 점검유형 | 장비명 | 설치위치 | 점검자 | 점검내용 | 특이사항
    // 아래에서 위로 (가장 최근 데이터부터) 검색
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const inspectionType = String(row[1] || '').trim();  // B열: 점검유형
      const equipmentName = String(row[2] || '').trim();   // C열: 장비명
      const dateValue = row[0];                            // A열: 날짜
      
      // 점검 유형과 장비명이 일치하는지 확인
      if (inspectionType !== type || equipmentName !== name) {
        continue;
      }
      
      // 날짜가 있는지 확인
      if (!dateValue) {
        continue;
      }
      
      try {
        // 날짜를 YYYY-MM-DD 형식의 문자열로 변환
        let dateStr = null;
        let dateObj = null;
        
        // Google Sheets에서 Date 객체로 반환될 수 있음
        // Utilities.formatDate를 사용하여 안정적으로 YYYY-MM-DD 형식으로 변환
        if (dateValue instanceof Date) {
          dateObj = dateValue;
          // Utilities.formatDate를 사용하여 YYYY-MM-DD 형식으로 변환
          dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else if (typeof dateValue === 'string') {
          // 문자열인 경우
          dateStr = dateValue.trim();
          // 날짜 파싱 시도
          dateObj = new Date(dateStr);
          if (isNaN(dateObj.getTime())) {
            // 파싱 실패 시 원본 문자열 유지하되 dateObj는 null
            dateObj = null;
          } else {
            // 성공하면 Utilities.formatDate를 사용하여 YYYY-MM-DD 형식으로 정규화
            dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          }
        } else if (typeof dateValue === 'number') {
          // 숫자인 경우 (시리얼 날짜 - Excel 형식)
          // Excel 시리얼 날짜는 1900-01-01부터의 일수
          dateObj = new Date((dateValue - 25569) * 86400 * 1000);
          dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        }
        
        // 유효한 날짜인지 확인
        if (dateStr && dateObj && !isNaN(dateObj.getTime())) {
          // 첫 번째로 찾은 것 (가장 최근 데이터)을 저장하고 종료
          lastDate = dateStr;
          lastDateObj = dateObj;
          Logger.log('마지막 점검일 찾음: ' + lastDate);
          break;
        }
      } catch (e) {
        // 날짜 파싱 실패 시 무시하고 계속
        Logger.log('날짜 파싱 오류 (행 ' + (i+1) + '): ' + e.toString());
        continue;
      }
    }
    
    if (!lastDate) {
      Logger.log('마지막 점검일을 찾을 수 없습니다');
    }
    
    return {
      success: true,
      date: lastDate
    };
    
  } catch (error) {
    Logger.log('마지막 점검 날짜 조회 실패: ' + error.toString());
    Logger.log('스택 트레이스: ' + error.stack);
    return {
      success: true,
      date: null
    };
  }
}

// 마지막 점검 날짜 업데이트
function updateLastInspectionDate(sheetName, type, name) {
  try {
    const spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    let sheet = spreadsheet.getSheetByName('Equipment');
    if (!sheet) {
      return {
        success: false,
        error: 'Equipment 시트를 찾을 수 없습니다.'
      };
    }
    
    const data = sheet.getDataRange().getValues();
    let rowToUpdate = -1;
    
    // 업데이트할 행 찾기 (시트명, 점검유형, 장비명 모두 일치)
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === sheetName && data[i][1] === type && data[i][2] === name) {
        rowToUpdate = i + 1; // 시트는 1부터 시작
        break;
      }
    }
    
    if (rowToUpdate === -1) {
      return {
        success: false,
        error: '해당 장비를 찾을 수 없습니다.'
      };
    }
    
    // 오늘 날짜를 ISO 형식으로 저장
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD 형식
    
    // 마지막 점검일 컬럼 업데이트 (6번째 컬럼, F열)
    sheet.getRange(rowToUpdate, 6).setValue(todayStr);
    
    return {
      success: true,
      message: '마지막 점검 날짜 업데이트 완료',
      date: todayStr
    };
    
  } catch (error) {
    console.error('마지막 점검 날짜 업데이트 실패:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// === 시트를 만들 때 사용하는 헬퍼 함수 ===
// 구글 시트에서 이 함수를 실행하면 Equipment와 InspectionItems 시트를 자동으로 생성합니다
function createEquipmentSheets() {
  const spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  
  // Equipment 시트 생성
  let equipmentSheet = spreadsheet.getSheetByName('Equipment');
  if (!equipmentSheet) {
    equipmentSheet = spreadsheet.insertSheet('Equipment');
    const headers = ['시트명', '점검유형', '장비명', '상태', '상태텍스트', '마지막점검일'];
    equipmentSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    Logger.log('✅ Equipment 시트 생성 완료');
  } else {
    Logger.log('⚠️ Equipment 시트가 이미 존재합니다');
  }
  
  // InspectionItems 시트 생성
  let inspectionItemsSheet = spreadsheet.getSheetByName('InspectionItems');
  if (!inspectionItemsSheet) {
    inspectionItemsSheet = spreadsheet.insertSheet('InspectionItems');
    const headers = ['점검유형', '점검항목'];
    inspectionItemsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    Logger.log('✅ InspectionItems 시트 생성 완료');
  } else {
    Logger.log('⚠️ InspectionItems 시트가 이미 존재합니다');
  }
  
  return {
    success: true,
    message: '시트 생성 완료'
  };
}

// 테스트용 함수 (선택사항)
function testAddData() {
  const testData = [
    '2025-01-24',  // 날짜
    '1-A',         // 점검유형
    'VP-001',      // 장비명
    '3동',         // 설치위치
    '강도영',      // 점검자
    '오일교체: 정상, 누유점검: 정상', // 점검내용
    '정상 작동'    // 특이사항
  ];
  
  return addInspectionData('1-A', testData);
}
