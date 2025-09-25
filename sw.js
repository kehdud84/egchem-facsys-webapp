// EGChem FACSYS 점검 시스템 - Service Worker
// 오프라인 지원 및 캐싱

const CACHE_NAME = 'egchem-facsys-v1.0.0';
const urlsToCache = [
  '/',
  '/index-github.html',
  '/styles/main.css',
  '/js/app.js',
  '/js/googleSheetsJSONP.js',
  '/js/inspection.js',
  '/EGChem 로고.png',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// 설치 이벤트
self.addEventListener('install', (event) => {
  console.log('Service Worker 설치 중...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('캐시 열기 성공');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('캐시 설치 실패:', error);
      })
  );
});

// 활성화 이벤트
self.addEventListener('activate', (event) => {
  console.log('Service Worker 활성화 중...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('이전 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// fetch 이벤트 (네트워크 요청 가로채기)
self.addEventListener('fetch', (event) => {
  // Google Apps Script 요청은 캐시하지 않음
  if (event.request.url.includes('script.google.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 캐시에 있으면 캐시에서 반환
        if (response) {
          return response;
        }
        
        // 캐시에 없으면 네트워크에서 가져오기
        return fetch(event.request).then((response) => {
          // 유효한 응답인지 확인
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // 응답을 캐시에 저장
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        }).catch(() => {
          // 네트워크 실패 시 오프라인 페이지 반환
          if (event.request.destination === 'document') {
            return caches.match('/index-github.html');
          }
        });
      })
  );
});

// 백그라운드 동기화 (점검 데이터 동기화)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('백그라운드 동기화 시작');
    event.waitUntil(
      // 저장된 점검 데이터를 구글 시트에 동기화
      syncInspectionData()
    );
  }
});

// 점검 데이터 동기화 함수
async function syncInspectionData() {
  try {
    // IndexedDB에서 저장된 점검 데이터 가져오기
    const pendingData = await getPendingInspectionData();
    
    if (pendingData.length > 0) {
      console.log('동기화할 데이터:', pendingData.length, '개');
      
      // 각 데이터를 구글 시트에 전송
      for (const data of pendingData) {
        try {
          await sendToGoogleSheets(data);
          // 성공하면 로컬 저장소에서 제거
          await removePendingData(data.id);
        } catch (error) {
          console.error('데이터 동기화 실패:', error);
        }
      }
    }
  } catch (error) {
    console.error('백그라운드 동기화 오류:', error);
  }
}

// IndexedDB에서 대기 중인 점검 데이터 가져오기
async function getPendingInspectionData() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('EGChemFACSYS', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['inspectionData'], 'readonly');
      const store = transaction.objectStore('inspectionData');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
  });
}

// 구글 시트에 데이터 전송
async function sendToGoogleSheets(data) {
  // JSONP 방식으로 구글 시트에 데이터 전송
  return new Promise((resolve, reject) => {
    const callbackName = `callback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    window[callbackName] = (result) => {
      delete window[callbackName];
      if (result.success) {
        resolve(result);
      } else {
        reject(new Error(result.error));
      }
    };
    
    const script = document.createElement('script');
    const params = new URLSearchParams({
      callback: callbackName,
      action: 'addInspectionData',
      sheetName: '1-A',
      data: JSON.stringify(data)
    });
    
    script.src = `${data.webAppUrl}?${params.toString()}`;
    script.onerror = () => {
      delete window[callbackName];
      reject(new Error('네트워크 오류'));
    };
    
    document.head.appendChild(script);
  });
}

// 대기 중인 데이터 제거
async function removePendingData(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('EGChemFACSYS', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['inspectionData'], 'readwrite');
      const store = transaction.objectStore('inspectionData');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}
