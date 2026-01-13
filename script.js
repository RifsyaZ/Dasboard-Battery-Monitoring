// ====== SYSTEM CONFIGURATION ======
const CONFIG = {
    apiEndpoint: "https://script.google.com/macros/s/AKfycbwzL42zeBad2lZh5S3NzQwQiiURV0xdpbrZcbKaK_X6ZnIzX3tAQ8IY_k_gGHjw9ylqsQ/exec",
    refreshInterval: 2000,
    historyPageSize: 500000,
    espTimeout: 15000
};

// ====== APPLICATION STATE ======
let appState = {
    voltage: 0.0,
    current: 0.0,
    temperature: 0.0,
    battery: 0.0,
    remainingTime: 0,
    fanStatus: "OFF",
    tempLimit: 45.0,
    power: 0.0,
    
    online: false,
    espConnected: false,
    lastUpdate: null,
    timeSinceLastUpdate: 0,
    lastSuccessfulUpdate: null,
    
    history: {
        data: [],
        pagination: {
            page: 1,
            totalPages: 1,
            totalRecords: 0
        }
    },
    
    chartData: {
        labels: [],
        voltage: [],
        current: [],
        temperature: [],
        battery: [],
        tempLimit: [],
        comparison: []
    }
};

// ====== CHART INSTANCE ======
let trendChart = null;

// ====== APPLICATION INITIALIZATION ======
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Starting Monitoring System...');
    
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    setupEventListeners();
    initializeChart();
    createTimeoutDisplay();
    
    loadInitialData();
    startDataPolling();
    startUptimeCounter();
    startTimeoutChecker();
    
    console.log('✅ System ready');
});

// ====== CREATE TIMEOUT DISPLAY ======
function createTimeoutDisplay() {
    let timeoutDisplay = document.getElementById('timeout-display');
    if (!timeoutDisplay) {
        const headerInfo = document.querySelector('.header-info');
        timeoutDisplay = document.createElement('div');
        timeoutDisplay.id = 'timeout-display';
        timeoutDisplay.className = 'timeout-indicator disconnected';
        timeoutDisplay.innerHTML = '<i class="fas fa-question-circle"></i> ESP32 Never Connected';
        
        const statusIndicator = document.getElementById('connection-status');
        if (statusIndicator && statusIndicator.parentNode) {
            statusIndicator.parentNode.insertBefore(timeoutDisplay, statusIndicator.nextSibling);
        } else {
            headerInfo.appendChild(timeoutDisplay);
        }
    }
}

// ====== START TIMEOUT CHECKER ======
function startTimeoutChecker() {
    setInterval(() => {
        if (appState.lastSuccessfulUpdate) {
            const timeSinceUpdate = Date.now() - appState.lastSuccessfulUpdate;
            appState.timeSinceLastUpdate = Math.floor(timeSinceUpdate / 1000);
            
            if (timeSinceUpdate > CONFIG.espTimeout) {
                appState.espConnected = false;
            } else {
                appState.espConnected = true;
            }
        } else {
            appState.espConnected = false;
        }
        
        updateTimeoutDisplay();
    }, 1000);
}

// ====== UPDATE TIMEOUT DISPLAY ======
function updateTimeoutDisplay() {
    const timeoutElement = document.getElementById('timeout-display');
    if (!timeoutElement) return;
    
    if (appState.espConnected && appState.online) {
        timeoutElement.innerHTML = `<i class="fas fa-check-circle"></i> ESP32 Connected (${appState.timeSinceLastUpdate}s ago)`;
        timeoutElement.className = 'timeout-indicator connected';
    } else if (appState.online && !appState.espConnected) {
        if (appState.timeSinceLastUpdate > 0) {
            timeoutElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ESP32 Timeout (${appState.timeSinceLastUpdate}s)`;
        } else {
            timeoutElement.innerHTML = `<i class="fas fa-question-circle"></i> ESP32 Never Connected`;
        }
        timeoutElement.className = 'timeout-indicator disconnected';
    } else {
        timeoutElement.innerHTML = `<i class="fas fa-wifi-slash"></i> Server Offline`;
        timeoutElement.className = 'timeout-indicator offline';
    }
}

// ====== UPDATE CURRENT TIME ======
function updateCurrentTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US');
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        timeElement.querySelector('span').textContent = timeStr;
    }
}

// ====== SETUP EVENT LISTENERS ======
function setupEventListeners() {
    // Chart type buttons
    document.querySelectorAll('.chart-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            updateChart(this.dataset.type);
        });
    });
    
    // Pagination buttons
    document.getElementById('prev-page').addEventListener('click', () => {
        if (appState.history.pagination.page > 1) {
            loadHistory(appState.history.pagination.page - 1);
        }
    });
    
    document.getElementById('next-page').addEventListener('click', () => {
        if (appState.history.pagination.page < appState.history.pagination.totalPages) {
            loadHistory(appState.history.pagination.page + 1);
        }
    });
    
    // Export button
    document.getElementById('export-btn').addEventListener('click', exportData);
    
    // Refresh rate selector
    document.getElementById('refresh-rate').addEventListener('change', function() {
        CONFIG.refreshInterval = parseInt(this.value);
        showMessage(`Refresh rate: ${CONFIG.refreshInterval/1000} seconds`, 'info');
    });
}

// ====== LOAD INITIAL DATA ======
async function loadInitialData() {
    try {
        console.log('📥 Loading initial data...');
        
        const testResult = await testConnection();
        if (!testResult.success) {
            showMessage('Cannot connect to server. Check API endpoint.', 'error');
            return;
        }
        
        console.log('✅ Connection test passed');
        
        await fetchLatestData();
        await loadHistory(1);
        
        showMessage('System loaded successfully', 'success');
    } catch (error) {
        console.error('❌ Error loading data:', error);
        showMessage('Failed to load data: ' + error.message, 'error');
    }
}

// ====== TEST CONNECTION ======
async function testConnection() {
    try {
        const url = CONFIG.apiEndpoint + '?action=test&_=' + Date.now();
        console.log('🧪 Testing connection to:', url);
        
        const response = await fetchWithTimeout(url, 5000);
        
        if (response.ok) {
            const data = await response.json();
            console.log('🧪 Connection test response:', data);
            return { success: true, message: 'Connection test passed', data: data };
        } else {
            const errorText = await response.text();
            console.error('🧪 HTTP error:', response.status, errorText);
            return { success: false, message: `HTTP error: ${response.status}` };
        }
        
    } catch (error) {
        console.error('❌ Connection test failed:', error);
        return { success: false, message: 'Connection failed: ' + error.message };
    }
}

// ====== FETCH LATEST DATA ======
async function fetchLatestData() {
    try {
        console.log('🔄 ====== FETCH LATEST DATA START ======');
        
        const response = await fetchFromGoogleSheets('getLatest');
        console.log('📦 Full API Response:', response);
        
        if (response.status === 'success') {
            console.log('✅ Server returned success status');
            
            appState.lastSuccessfulUpdate = Date.now();
            appState.online = true;
            
            // Check if data exists
            if (response.data) {
                console.log('📊 Data received from API:', response.data);
                
                // Update app state with received data
                updateAppState(response.data);
                
                // Update ESP connection status
                if (response.esp_connected !== undefined) {
                    appState.espConnected = response.esp_connected;
                }
                
                if (response.time_since_last) {
                    appState.timeSinceLastUpdate = parseInt(response.time_since_last) || 0;
                }
                
                // Update UI
                updateDashboard();
                updateChartData();
                updateConnectionStatus();
                
                console.log('✅ Data updated successfully');
                console.log('📈 Current App State:', {
                    voltage: appState.voltage,
                    current: appState.current,
                    temperature: appState.temperature,
                    battery: appState.battery,
                    tempLimit: appState.tempLimit,
                    fanStatus: appState.fanStatus,
                    power: appState.power
                });
                
            } else {
                console.warn('⚠️ API returned success but data is null');
                console.log('🔍 Response structure:', response);
                
                appState.espConnected = false;
                updateConnectionStatus();
                showPlaceholderData();
                showMessage('No data available from server', 'info');
            }
            
        } else {
            console.error('❌ Server returned error:', response);
            appState.online = false;
            appState.espConnected = false;
            updateConnectionStatus();
            showPlaceholderData();
            showMessage('Server error: ' + (response.message || 'Unknown error'), 'error');
        }
        
    } catch (error) {
        console.error('❌ Error in fetchLatestData:', error);
        appState.online = false;
        appState.espConnected = false;
        updateConnectionStatus();
        showPlaceholderData();
        
        showMessage('Failed to fetch data: ' + error.message, 'error');
    }
    
    console.log('🔄 ====== FETCH LATEST DATA END ======');
}

// ====== FETCH FROM GOOGLE SHEETS ======
async function fetchFromGoogleSheets(action, params = {}) {
    // Build URL manually
    let url = CONFIG.apiEndpoint + '?action=' + encodeURIComponent(action);
    
    // Add other parameters
    for (const key in params) {
        if (params.hasOwnProperty(key)) {
            url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }
    }
    
    // Add cache buster
    url += '&_=' + Date.now();
    
    console.log('🌐 Fetching URL:', url);
    
    try {
        const response = await fetchWithTimeout(url, 10000);
        console.log('📥 Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Response error:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text();
        console.log('📥 Raw response:', text.substring(0, 200) + '...');
        
        const data = JSON.parse(text);
        console.log('✅ Parsed data:', data);
        return data;
        
    } catch (error) {
        console.error('❌ Fetch error:', error);
        throw error;
    }
}

// ====== UPDATE APP STATE ======
function updateAppState(data) {
    if (!data) {
        console.warn('⚠️ updateAppState called with null data');
        return;
    }
    
    console.log('📊 Updating App State with data:', data);
    
    // Update all values from API data
    appState.voltage = parseFloat(data.voltage) || 0.0;
    appState.current = parseFloat(data.current) || 0.0;
    appState.temperature = parseFloat(data.temperature) || 0.0;
    appState.battery = parseFloat(data.battery) || 0.0;
    appState.remainingTime = parseInt(data.remaining_time) || 0;
    appState.tempLimit = parseFloat(data.temp_limit) || 45.0;
    appState.fanStatus = data.fan_status || "OFF";
    appState.power = appState.voltage * appState.current;
    appState.lastUpdate = new Date();
    
    console.log('✅ App State Updated:', {
        voltage: appState.voltage,
        current: appState.current,
        temperature: appState.temperature,
        battery: appState.battery,
        tempLimit: appState.tempLimit,
        fanStatus: appState.fanStatus,
        power: appState.power,
        remainingTime: appState.remainingTime
    });
    
    // Update last data time display
    const lastDataElement = document.getElementById('last-data-time');
    if (lastDataElement) {
        if (data.timestamp) {
            const updateTime = new Date(data.timestamp);
            lastDataElement.textContent = updateTime.toLocaleTimeString('en-US');
        } else {
            lastDataElement.textContent = appState.lastUpdate.toLocaleTimeString('en-US');
        }
    }
}

// ====== SHOW PLACEHOLDER DATA ======
function showPlaceholderData() {
    console.log('⚠️ Showing placeholder data (offline mode)');
    
    // Update hanya elemen yang ada di HTML
    const elements = [
        {id: 'voltage-value', text: '--'},
        {id: 'current-value', text: '--'},
        {id: 'temperature-value', text: '--'},
        {id: 'battery-value', text: '--'},
        {id: 'temp-limit-value', text: '--'},
        {id: 'remaining-time', text: '--'},
        {id: 'fan-status', text: '--'},
        {id: 'temp-value', text: '--'},
        {id: 'temp-limit-display', text: '--'},
        {id: 'power-value', text: '--'},
        {id: 'current-temp-limit', text: '-- °C'},
        {id: 'footer-temp-limit', text: '-- °C'}
    ];
    
    elements.forEach(item => {
        const element = document.getElementById(item.id);
        if (element) {
            element.textContent = item.text;
        }
    });
    
    // Reset gauges
    const gauges = [
        'voltage-gauge', 'current-gauge', 'temperature-gauge',
        'battery-gauge', 'temp-limit-gauge'
    ];
    
    gauges.forEach(id => {
        const gauge = document.getElementById(id);
        if (gauge) {
            gauge.style.width = '0%';
        }
    });
}

// ====== UPDATE DASHBOARD ======
function updateDashboard() {
    console.log('📊 Updating dashboard...');
    
    // Update all display values
    document.getElementById('voltage-value').textContent = appState.voltage.toFixed(1);
    document.getElementById('current-value').textContent = appState.current.toFixed(1);
    document.getElementById('temperature-value').textContent = appState.temperature.toFixed(1);
    document.getElementById('battery-value').textContent = appState.battery.toFixed(1);
    document.getElementById('temp-limit-value').textContent = appState.tempLimit.toFixed(1);
    document.getElementById('remaining-time').textContent = appState.remainingTime;
    document.getElementById('fan-status').textContent = appState.fanStatus;
    document.getElementById('temp-value').textContent = appState.temperature.toFixed(1);
    document.getElementById('temp-limit-display').textContent = appState.tempLimit.toFixed(1);
    document.getElementById('power-value').textContent = appState.power.toFixed(1);
    
    // Update footer
    document.getElementById('current-temp-limit').textContent = appState.tempLimit.toFixed(1) + ' °C';
    document.getElementById('footer-temp-limit').textContent = appState.tempLimit.toFixed(1) + ' °C';
    
    // Update fan status color
    updateFanStatusColor();
    
    // Update all gauges
    updateGauges();
    
    // Update last update time
    const lastUpdateElement = document.getElementById('last-update');
    if (lastUpdateElement) {
        lastUpdateElement.textContent = new Date().toLocaleTimeString('en-US');
    }
    
    console.log('✅ Dashboard updated');
}

// ====== UPDATE FAN STATUS COLOR ======
function updateFanStatusColor() {
    const fanElement = document.getElementById('fan-status');
    const tempValue = appState.temperature;
    const tempLimit = appState.tempLimit;
    const tempDiff = tempValue - tempLimit;
    
    fanElement.className = '';
    
    if (appState.fanStatus === "ON") {
        fanElement.classList.add('fan-on');
        if (tempDiff > 5) {
            fanElement.style.color = '#ff3333';
            fanElement.title = 'Fan ON - Temperature CRITICAL!';
        } else if (tempDiff > 0) {
            fanElement.style.color = '#ff9900';
            fanElement.title = 'Fan ON - Temperature above limit';
        } else {
            fanElement.style.color = '#33cc33';
            fanElement.title = 'Fan ON - Cooling active';
        }
    } else {
        fanElement.classList.add('fan-off');
        if (tempDiff > 5) {
            fanElement.style.color = '#ff3333';
            fanElement.title = 'Fan OFF - Temperature CRITICAL!';
        } else if (tempDiff > 0) {
            fanElement.style.color = '#ff9900';
            fanElement.title = 'Fan OFF - Temperature above limit';
        } else {
            fanElement.style.color = '#666666';
            fanElement.title = 'Fan OFF - Temperature normal';
        }
    }
}

// ====== UPDATE GAUGES ======
function updateGauges() {
    // Voltage gauge (21V-29.4V range)
    const voltagePercent = ((appState.voltage - 21) / (29.4 - 21)) * 100;
    const voltageGauge = document.getElementById('voltage-gauge');
    if (voltageGauge) {
        voltageGauge.style.width = `${Math.min(Math.max(voltagePercent, 0), 100)}%`;
    }
    
    // Current gauge (0A-10A range)
    const currentPercent = (appState.current / 10) * 100;
    const currentGauge = document.getElementById('current-gauge');
    if (currentGauge) {
        currentGauge.style.width = `${Math.min(Math.max(currentPercent, 0), 100)}%`;
    }
    
    // Temperature gauge (20°C-40°C range)
    const tempPercent = ((appState.temperature - 20) / (40 - 20)) * 100;
    const tempGauge = document.getElementById('temperature-gauge');
    if (tempGauge) {
        tempGauge.style.width = `${Math.min(Math.max(tempPercent, 0), 100)}%`;
    }
    
    // Battery gauge (0%-100% range)
    const batteryGauge = document.getElementById('battery-gauge');
    if (batteryGauge) {
        batteryGauge.style.width = `${Math.min(Math.max(appState.battery, 0), 100)}%`;
    }
    
    // Temp Limit gauge (20°C-60°C range)
    const tempLimitPercent = ((appState.tempLimit - 20) / (60 - 20)) * 100;
    const tempLimitGauge = document.getElementById('temp-limit-gauge');
    if (tempLimitGauge) {
        tempLimitGauge.style.width = `${Math.min(Math.max(tempLimitPercent, 0), 100)}%`;
    }
}

// ====== LOAD HISTORY ======
async function loadHistory(page = 1) {
    try {
        console.log(`📚 Loading history page ${page}...`);
        
        const response = await fetchFromGoogleSheets('getHistory', {
            page: page,
            limit: CONFIG.historyPageSize
        });
        
        if (response.status === 'success') {
            appState.history.data = response.data;
            appState.history.pagination = response.pagination;
            renderHistoryTable();
            updatePaginationControls();
            updateTotalData();
            
            console.log(`✅ History loaded: ${response.data.length} records`);
        } else {
            throw new Error('Failed to load history: ' + response.message);
        }
    } catch (error) {
        console.error('❌ Error loading history:', error);
        showMessage('Failed to load history data: ' + error.message, 'error');
        renderHistoryTable();
    }
}

// ====== RENDER HISTORY TABLE ======
function renderHistoryTable() {
    const tbody = document.getElementById('history-table');
    
    if (appState.history.data.length === 0) {
        tbody.innerHTML = `
            <tr class="no-data">
                <td colspan="9">
                    <i class="fas fa-database"></i>
                    No historical data available
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = appState.history.data.map(item => `
        <tr>
            <td>${item.date || '--'}</td>
            <td>${item.time || '--'}</td>
            <td>${(item.voltage || 0).toFixed(1)} V</td>
            <td>${(item.current || 0).toFixed(1)} A</td>
            <td>${(item.temperature || 0).toFixed(1)} °C</td>
            <td>${(item.battery || 0).toFixed(1)} %</td>
            <td><span class="fan-status ${(item.fan_status || 'OFF') === 'ON' ? 'fan-on' : 'fan-off'}">${item.fan_status || '--'}</span></td>
            <td>${(item.temp_limit || 0).toFixed(1)} °C</td>
            <td>${((item.voltage || 0) * (item.current || 0)).toFixed(1)} W</td>
        </tr>
    `).join('');
}

// ====== UPDATE PAGINATION CONTROLS ======
function updatePaginationControls() {
    const pagination = appState.history.pagination;
    
    document.getElementById('current-page').textContent = pagination.page;
    document.getElementById('total-pages').textContent = pagination.totalPages;
    
    document.getElementById('prev-page').disabled = pagination.page === 1;
    document.getElementById('next-page').disabled = pagination.page === pagination.totalPages;
}

// ====== UPDATE TOTAL DATA ======
function updateTotalData() {
    const totalDataElement = document.getElementById('total-data');
    if (totalDataElement) {
        totalDataElement.textContent = appState.history.pagination.totalRecords;
    }
}

// ====== INITIALIZE CHART ======
function initializeChart() {
    const canvas = document.getElementById('trend-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Voltage (V)',
                data: [],
                borderColor: '#0099ff',
                backgroundColor: 'rgba(0, 153, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#b3cde0' }
                },
                tooltip: { 
                    mode: 'index', 
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(1);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#b3cde0', maxTicksLimit: 10 }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#b3cde0' },
                    beginAtZero: false
                }
            },
            interaction: { intersect: false, mode: 'nearest' },
            animation: { duration: 750 }
        }
    });
}

// ====== UPDATE CHART DATA ======
function updateChartData() {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    
    appState.chartData.labels.push(timeLabel);
    appState.chartData.voltage.push(appState.voltage);
    appState.chartData.current.push(appState.current);
    appState.chartData.temperature.push(appState.temperature);
    appState.chartData.battery.push(appState.battery);
    appState.chartData.tempLimit.push(appState.tempLimit);
    
    // Untuk chart comparison
    const tempDiff = appState.temperature - appState.tempLimit;
    appState.chartData.comparison.push(tempDiff);
    
    // Keep only last 30 points
    const maxPoints = 30;
    if (appState.chartData.labels.length > maxPoints) {
        appState.chartData.labels.shift();
        appState.chartData.voltage.shift();
        appState.chartData.current.shift();
        appState.chartData.temperature.shift();
        appState.chartData.battery.shift();
        appState.chartData.tempLimit.shift();
        appState.chartData.comparison.shift();
    }
    
    // Update chart if there's an active button
    const activeBtn = document.querySelector('.chart-btn.active');
    if (activeBtn) {
        updateChart(activeBtn.dataset.type);
    }
}

// ====== UPDATE CHART ======
function updateChart(type) {
    if (!trendChart) return;
    
    let datasets = [];
    let min = 0;
    let max = 100;
    
    switch(type) {
        case 'voltage':
            datasets = [{
                label: 'Voltage (V)',
                data: appState.chartData.voltage,
                borderColor: '#0099ff',
                backgroundColor: '#0099ff20',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }];
            min = Math.min(...appState.chartData.voltage) - 0.5;
            max = Math.max(...appState.chartData.voltage) + 0.5;
            break;
            
        case 'current':
            datasets = [{
                label: 'Current (A)',
                data: appState.chartData.current,
                borderColor: '#ff9900',
                backgroundColor: '#ff990020',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }];
            min = Math.min(...appState.chartData.current) - 0.1;
            max = Math.max(...appState.chartData.current) + 0.1;
            break;
            
        case 'temperature':
            datasets = [{
                label: 'Temperature (°C)',
                data: appState.chartData.temperature,
                borderColor: '#ff3333',
                backgroundColor: '#ff333320',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }];
            min = Math.min(...appState.chartData.temperature) - 2;
            max = Math.max(...appState.chartData.temperature) + 2;
            break;
            
        case 'battery':
            datasets = [{
                label: 'Battery (%)',
                data: appState.chartData.battery,
                borderColor: '#8a2be2',
                backgroundColor: '#8a2be220',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }];
            min = 0;
            max = 100;
            break;
            
        case 'temp-limit':
            datasets = [{
                label: 'Temperature Limit (°C)',
                data: appState.chartData.tempLimit,
                borderColor: '#ff66b2',
                backgroundColor: '#ff66b220',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }];
            min = Math.min(...appState.chartData.tempLimit) - 2;
            max = Math.max(...appState.chartData.tempLimit) + 2;
            break;
            
        case 'comparison':
            datasets = [
                {
                    label: 'Temperature (°C)',
                    data: appState.chartData.temperature,
                    borderColor: '#ff3333',
                    backgroundColor: 'rgba(255, 51, 51, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Temp Limit (°C)',
                    data: appState.chartData.tempLimit,
                    borderColor: '#ff66b2',
                    backgroundColor: 'rgba(255, 102, 178, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    borderDash: [5, 5]
                }
            ];
            const allTempData = [...appState.chartData.temperature, ...appState.chartData.tempLimit];
            min = Math.min(...allTempData) - 2;
            max = Math.max(...allTempData) + 2;
            break;
            
        default:
            return;
    }
    
    trendChart.data.labels = appState.chartData.labels;
    trendChart.data.datasets = datasets;
    
    if (type !== 'comparison') {
        trendChart.options.scales.y.min = min;
        trendChart.options.scales.y.max = max;
    }
    
    trendChart.update('none');
}

// ====== START DATA POLLING ======
function startDataPolling() {
    // Fetch immediately
    fetchLatestData();
    
    // Then set interval
    setInterval(() => {
        if (appState.online || appState.espConnected) {
            fetchLatestData();
        } else {
            // Try to reconnect
            fetchLatestData().catch(() => {
                console.log('🔄 Attempting to reconnect...');
            });
        }
    }, CONFIG.refreshInterval);
}

// ====== START UPTIME COUNTER ======
function startUptimeCounter() {
    let seconds = 0;
    
    setInterval(() => {
        seconds++;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        const uptimeElement = document.getElementById('uptime');
        if (uptimeElement) {
            uptimeElement.textContent = 
                `${hours.toString().padStart(2, '0')}:` +
                `${minutes.toString().padStart(2, '0')}:` +
                `${secs.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// ====== UPDATE CONNECTION STATUS ======
function updateConnectionStatus() {
    const statusElement = document.getElementById('connection-status');
    const systemStatus = document.getElementById('system-status');
    const dataSource = document.getElementById('data-source');
    
    if (!statusElement || !systemStatus || !dataSource) return;
    
    if (appState.espConnected && appState.online) {
        statusElement.className = 'status-indicator online';
        statusElement.innerHTML = '<i class="fas fa-wifi"></i><span>Connected to ESP32</span>';
        
        systemStatus.className = 'status-text online';
        systemStatus.textContent = 'Online';
        
        dataSource.textContent = 'Google Sheets (Live)';
        
    } else if (!appState.espConnected && appState.online) {
        statusElement.className = 'status-indicator warning';
        statusElement.innerHTML = '<i class="fas fa-wifi-exclamation"></i><span>ESP32 Timeout</span>';
        
        systemStatus.className = 'status-text warning';
        systemStatus.textContent = 'ESP Offline';
        
        dataSource.textContent = 'Google Sheets (No ESP)';
        
    } else {
        statusElement.className = 'status-indicator offline';
        statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i><span>Server Offline</span>';
        
        systemStatus.className = 'status-text offline';
        systemStatus.textContent = 'Offline';
        
        dataSource.textContent = 'Google Sheets (Offline)';
    }
}

// ====== EXPORT DATA ======
function exportData() {
    if (appState.history.data.length === 0) {
        showMessage('No data to export', 'error');
        return;
    }
    
    let csv = 'Date,Time,Voltage (V),Current (A),Temperature (°C),Battery (%),Fan Status,Temp Limit (°C),Power (W)\n';
    
    appState.history.data.forEach(item => {
        csv += `${item.date || ''},${item.time || ''},${item.voltage || ''},${item.current || ''},${item.temperature || ''},${item.battery || ''},${item.fan_status || ''},${item.temp_limit || ''},${item.power || ''}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const now = new Date();
    const filename = `battery-data-${now.toISOString().split('T')[0]}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showMessage(`Data exported: ${filename}`, 'success');
}

// ====== SHOW MESSAGE ======
function showMessage(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// ====== HELPER FUNCTION FOR TIMEOUT ======
function fetchWithTimeout(url, timeout = 5000) {
    return Promise.race([
        fetch(url),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
    ]);
}

// ====== DEBUG FUNCTIONS ======
async function debugAPI() {
    console.log('🔍 Debugging API connection...');
    
    try {
        const url = CONFIG.apiEndpoint + '?action=getLatest&_=' + Date.now();
        console.log('📡 Request URL:', url);
        
        const response = await fetch(url);
        console.log('📥 Response status:', response.status);
        
        const text = await response.text();
        console.log('📥 Raw response:', text);
        
        const data = JSON.parse(text);
        console.log('📊 Parsed data:', data);
        
        alert(`API Response:\nStatus: ${data.status}\nMessage: ${data.message}\nData available: ${!!data.data}\nESP Connected: ${data.esp_connected}`);
        
        if (data.data) {
            console.log('📈 Data structure:', Object.keys(data.data));
        }
        
    } catch (error) {
        console.error('❌ Debug error:', error);
        alert('Debug error: ' + error.message);
    }
}

// ====== EXPORT FUNCTIONS TO WINDOW ======
window.exportData = exportData;
window.debugAPI = debugAPI;
window.getAppState = () => appState;

// ====== ADD STYLES DYNAMICALLY ======
const style = document.createElement('style');
style.textContent = `
    .fan-status {
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: bold;
        display: inline-block;
        min-width: 40px;
        text-align: center;
    }
    .fan-on {
        background-color: rgba(51, 204, 51, 0.2);
        color: #33cc33;
        border: 1px solid rgba(51, 204, 51, 0.3);
    }
    .fan-off {
        background-color: rgba(255, 51, 51, 0.2);
        color: #ff3333;
        border: 1px solid rgba(255, 51, 51, 0.3);
    }
    
    .toast {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    
    .toast.success {
        background: linear-gradient(135deg, #00cc66, #00a854);
        border-left: 4px solid #00ff88;
    }
    
    .toast.error {
        background: linear-gradient(135deg, #ff3333, #cc0000);
        border-left: 4px solid #ff6666;
    }
    
    .toast.info {
        background: linear-gradient(135deg, #0099ff, #0066cc);
        border-left: 4px solid #66b3ff;
    }
    
    .toast.hide {
        animation: slideOut 0.3s ease forwards;
    }
    
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .toast i { font-size: 1.2rem; }
    
    .timeout-indicator {
        padding: 10px 16px;
        border-radius: 20px;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
        transition: all 0.3s ease;
    }
    
    .timeout-indicator.connected {
        background: rgba(0, 204, 102, 0.15);
        color: #00cc66;
        border: 1px solid rgba(0, 204, 102, 0.3);
    }
    
    .timeout-indicator.disconnected {
        background: rgba(255, 153, 0, 0.15);
        color: #ff9900;
        border: 1px solid rgba(255, 153, 0, 0.3);
    }
    
    .timeout-indicator.offline {
        background: rgba(255, 51, 51, 0.15);
        color: #ff3333;
        border: 1px solid rgba(255, 51, 51, 0.3);
    }
    
    .timeout-indicator i { font-size: 1rem; }
    
    .status-indicator.warning {
        background: rgba(255, 153, 0, 0.15);
        color: #ff9900;
        border: 1px solid rgba(255, 153, 0, 0.3);
    }
    
    .status-indicator.warning i { color: #ff9900; }
    
    .status-text.warning {
        background: rgba(255, 153, 0, 0.2);
        color: #ff9900;
        border: 1px solid rgba(255, 153, 0, 0.3);
    }
    
    @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
    
    .timeout-indicator.disconnected {
        animation: blink 2s infinite;
    }
`;
document.head.appendChild(style);

// ====== INITIAL DEBUG ======
console.log('🔧 Configuration:', CONFIG);
console.log('🔧 Initial App State:', appState);