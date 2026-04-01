let services = [];
let categories = [];
let showHiddenContainers = false;
let hiddenCount = 0;
let searchQuery = '';
let dragSrc = null;
let previousContainerIds = null;
let previousContainerNames = new Map();

// Usa o hostname atual do navegador para gerar URLs dinâmicas
function getCurrentHost() {
    return window.location.hostname;
}

// ============================================
// TEMA - Dark/Light Mode
// ============================================
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;
    
    // Verifica a preferência salva no localStorage ou sistema
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    
    // Aplica o tema
    applyTheme(theme);
    
    // Atualiza o estado do toggle
    if (themeToggle) {
        themeToggle.checked = theme === 'light';
        
        // Listener para mudanças
        themeToggle.addEventListener('change', (e) => {
            const newTheme = e.target.checked ? 'light' : 'dark';
            applyTheme(newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }
    
    // Listener para mudanças de preferência do sistema
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const newTheme = e.matches ? 'dark' : 'light';
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        if (themeToggle) themeToggle.checked = newTheme === 'light';
    });
}

function applyTheme(theme) {
    const htmlElement = document.documentElement;
    if (theme === 'light') {
        htmlElement.setAttribute('data-theme', 'light');
    } else {
        htmlElement.removeAttribute('data-theme');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    loadServices();
    loadHostInfo();
    startPolling();
});

async function loadHostInfo() {
    try {
        document.getElementById('host-ip').textContent = getCurrentHost();
    } catch (error) {
        console.error('Erro ao carregar info do host:', error);
    }
}

async function loadServices() {
    const container = document.getElementById('services-container');
    container.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Carregando serviços...</p>
        </div>
    `;

    try {
        const url = `/api/all-services${showHiddenContainers ? '?showHidden=true' : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        services = data.services;
        categories = data.categories;
        hiddenCount = data.hiddenCount || 0;

        if (previousContainerIds === null) {
            previousContainerIds = new Set(data.services.filter(s => s.isDocker).map(s => s.id));
            previousContainerNames = new Map(data.services.filter(s => s.isDocker).map(s => [s.id, s.name]));
        }

        updateStats();
        renderServices();
        updateCategorySelect();
        updateHiddenButton();
    } catch (error) {
        console.error('Erro ao carregar serviços:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Erro ao carregar serviços</h3>
                <p>Verifique se o servidor está rodando corretamente.</p>
            </div>
        `;
    }
}

function updateHiddenButton() {
    const btn = document.getElementById('btn-toggle-hidden');
    if (btn) {
        if (hiddenCount > 0) {
            btn.style.display = 'flex';
            btn.innerHTML = showHiddenContainers
                ? `<i class="fa-solid fa-eye"></i> Ocultar (${hiddenCount})`
                : `<i class="fa-solid fa-eye-slash"></i> Ocultos (${hiddenCount})`;
            btn.classList.toggle('active', showHiddenContainers);
        } else {
            btn.style.display = 'none';
        }
    }
}

function toggleHiddenContainers() {
    showHiddenContainers = !showHiddenContainers;
    loadServices();
}

function updateStats() {
    const dockerCount = services.filter(s => s.isDocker).length;
    const manualCount = services.filter(s => !s.isDocker).length;
    
    document.getElementById('docker-count').textContent = dockerCount;
    document.getElementById('manual-count').textContent = manualCount;
    document.getElementById('category-count').textContent = categories.length;
}

function renderServices() {
    const container = document.getElementById('services-container');

    const filtered = searchQuery
        ? services.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : services;

    if (filtered.length === 0) {
        container.innerHTML = searchQuery
            ? `<div class="empty-state"><i class="fas fa-search"></i><h3>Nenhum resultado para "${searchQuery}"</h3></div>`
            : `<div class="empty-state"><i class="fas fa-box-open"></i><h3>Nenhum serviço encontrado</h3><p>Adicione um serviço manualmente ou inicie containers Docker.</p></div>`;
        return;
    }

    const grouped = {};
    categories.forEach(cat => grouped[cat] = []);

    filtered.forEach(service => {
        const cat = service.category || 'Outros';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(service);
    });

    let html = '';
    for (const [category, categoryServices] of Object.entries(grouped)) {
        if (categoryServices.length === 0) continue;
        const ordered = applyOrder(categoryServices, category);
        html += `
            <section class="category-section">
                <div class="category-header">
                    <i class="fa-solid fa-folder"></i>
                    <h2>${category}</h2>
                    <span class="badge">${ordered.length}</span>
                </div>
                <div class="services-grid">
                    ${ordered.map(service => renderServiceCard(service)).join('')}
                </div>
            </section>
        `;
    }

    container.innerHTML = html;
    initDragDrop();
}

function renderServiceCard(service) {
    const color = service.color || '#00d9ff';
    let icon = service.icon || 'cube';
    if (!icon.startsWith('fa-')) {
        icon = 'fa-' + icon;
    }

    const protocol = service.protocol || 'http';
    const host = getCurrentHost();
    const url = service.port ? `${protocol}://${host}:${service.port}` : null;
    const isHidden = service.isHidden || false;
    const hiddenClass = isHidden ? 'hidden-service' : '';

    const hideButton = service.isDocker ? `
        <button onclick="${isHidden ? `showContainer('${service.id}')` : `hideContainer('${service.id}')`}"
                title="${isHidden ? 'Mostrar' : 'Ocultar'}" class="${isHidden ? 'show-btn' : 'hide-btn'}">
            <i class="fa-solid ${isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i>
        </button>
    ` : '';

    if (!url) {
        return `
            <div class="service-card needs-config ${hiddenClass}" data-id="${service.id}" style="--card-color: #f39c12">
                <span class="service-badge config-badge"><i class="fa-solid fa-gear"></i> Configurar</span>
                <div class="service-icon" style="background: #f39c12">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <h3 class="service-name">${service.name}</h3>
                <p class="service-description">Container sem porta exposta. Clique para configurar.</p>
                <div class="service-actions" style="opacity: 1;">
                    <button onclick="editDockerService('${service.id}', '${service.name}')" title="Configurar">
                        <i class="fa-solid fa-gear"></i>
                    </button>
                    ${hideButton}
                </div>
            </div>
        `;
    }

    return `
        <a href="${url}" target="_blank" class="service-card ${service.isDocker ? 'docker-service' : ''} ${hiddenClass}"
           data-id="${service.id}" style="--card-color: ${color}">
            ${isHidden ? '<span class="service-badge hidden-badge"><i class="fa-solid fa-eye-slash"></i> Oculto</span>' :
              (service.isDocker ? '<span class="service-badge"><i class="fa-brands fa-docker"></i> Docker</span>' : '')}
            <div class="service-icon" style="background: ${color}">
                <i class="fa-solid ${icon}"></i>
            </div>
            <h3 class="service-name">${service.name}</h3>
            <div class="service-url">
                <i class="fa-solid fa-link"></i>
                <span>${url}</span>
            </div>
            ${service.description ? `<p class="service-description">${service.description}</p>` : ''}
            <div class="service-actions" onclick="event.preventDefault(); event.stopPropagation();">
                ${service.isDocker ? `
                    <button onclick="editDockerService('${service.id}', '${service.name}')" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    ${hideButton}
                ` : `
                    <button onclick="editService('${service.id}')" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="delete-btn" onclick="deleteService('${service.id}')" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                `}
            </div>
        </a>
    `;
}

function updateCategorySelect() {
    const select = document.getElementById('service-category');
    select.innerHTML = categories.map(cat =>
        `<option value="${cat}">${cat}</option>`
    ).join('');
}

function openServiceModal() {
    document.getElementById('service-modal').classList.add('active');
    document.getElementById('modal-title').textContent = 'Adicionar Serviço';
    document.getElementById('service-form').reset();
    document.getElementById('service-id').value = '';
    document.getElementById('service-color').value = '#00d9ff';
    updateCategorySelect();
}

function closeServiceModal() {
    document.getElementById('service-modal').classList.remove('active');
}

async function saveService(event) {
    event.preventDefault();

    const id = document.getElementById('service-id').value;
    const port = document.getElementById('service-port').value;
    const protocol = document.getElementById('service-protocol').value;

    const serviceData = {
        name: document.getElementById('service-name').value,
        port: parseInt(port),
        protocol: protocol,
        category: document.getElementById('service-category').value,
        icon: document.getElementById('service-icon').value || 'fa-cube',
        color: document.getElementById('service-color').value,
        description: document.getElementById('service-description').value
    };

    try {
        if (id) {
            await fetch(`/api/services/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serviceData)
            });
        } else {
            await fetch('/api/services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serviceData)
            });
        }

        closeServiceModal();
        loadServices();
    } catch (error) {
        console.error('Erro ao salvar serviço:', error);
        alert('Erro ao salvar serviço');
    }
}

function editService(id) {
    const service = services.find(s => s.id === id);
    if (!service) return;

    document.getElementById('modal-title').textContent = 'Editar Serviço';
    document.getElementById('service-id').value = service.id;
    document.getElementById('service-name').value = service.name;
    document.getElementById('service-port').value = service.port;
    document.getElementById('service-icon').value = service.icon || 'fa-cube';
    document.getElementById('service-color').value = service.color || '#00d9ff';
    document.getElementById('service-description').value = service.description || '';

    updateCategorySelect();
    document.getElementById('service-category').value = service.category;

    document.getElementById('service-modal').classList.add('active');
}

async function deleteService(id) {
    if (!confirm('Tem certeza que deseja excluir este serviço?')) return;

    try {
        await fetch(`/api/services/${id}`, { method: 'DELETE' });
        loadServices();
    } catch (error) {
        console.error('Erro ao excluir serviço:', error);
        alert('Erro ao excluir serviço');
    }
}

function openCategoryModal() {
    document.getElementById('category-modal').classList.add('active');
    document.getElementById('category-form').reset();
}

function closeCategoryModal() {
    document.getElementById('category-modal').classList.remove('active');
}

async function saveCategory(event) {
    event.preventDefault();

    const name = document.getElementById('category-name').value;

    try {
        await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        closeCategoryModal();
        loadServices();
    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        alert('Erro ao criar categoria');
    }
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    }
});

function editDockerService(id, name) {
    const service = services.find(s => s.id === id);

    document.getElementById('docker-modal-title').textContent = `Configurar: ${name}`;
    document.getElementById('docker-id').value = id;
    document.getElementById('docker-name').value = name;
    document.getElementById('docker-port').value = service?.port || '';
    document.getElementById('docker-protocol').value = service?.protocol || 'http';
    document.getElementById('docker-icon').value = service?.icon || '';
    document.getElementById('docker-color').value = service?.color || '#00d9ff';

    updateDockerCategorySelect();
    document.getElementById('docker-category').value = service?.category || 'Outros';
    document.getElementById('docker-modal').classList.add('active');
}

function closeDockerModal() {
    document.getElementById('docker-modal').classList.remove('active');
}

function updateDockerCategorySelect() {
    const select = document.getElementById('docker-category');
    select.innerHTML = categories.map(cat =>
        `<option value="${cat}">${cat}</option>`
    ).join('');
}

async function saveDockerOverride(event) {
    event.preventDefault();

    const id = document.getElementById('docker-id').value;
    const iconValue = document.getElementById('docker-icon').value.trim();

    const overrideData = {
        port: parseInt(document.getElementById('docker-port').value) || null,
        protocol: document.getElementById('docker-protocol').value,
        category: document.getElementById('docker-category').value,
        icon: iconValue || null,
        color: document.getElementById('docker-color').value
    };

    try {
        await fetch(`/api/docker-override/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(overrideData)
        });

        closeDockerModal();
        loadServices();
    } catch (error) {
        console.error('Erro ao salvar configuração:', error);
        alert('Erro ao salvar configuração');
    }
}

async function hideContainer(id) {
    try {
        await fetch(`/api/hide-container/${id}`, { method: 'POST' });
        loadServices();
    } catch (error) {
        console.error('Erro ao ocultar container:', error);
        alert('Erro ao ocultar container');
    }
}

async function showContainer(id) {
    try {
        await fetch(`/api/hide-container/${id}`, { method: 'DELETE' });
        loadServices();
    } catch (error) {
        console.error('Erro ao mostrar container:', error);
        alert('Erro ao mostrar container');
    }
}

// ============================================
// BUSCA
// ============================================
function onSearch(value) {
    searchQuery = value.trim();
    document.getElementById('search-clear').style.display = searchQuery ? 'flex' : 'none';
    renderServices();
}

function clearSearch() {
    searchQuery = '';
    document.getElementById('search-input').value = '';
    document.getElementById('search-clear').style.display = 'none';
    renderServices();
}

// ============================================
// DRAG & DROP (reordenar e mover entre categorias)
// ============================================
function initDragDrop() {
    document.querySelectorAll('.service-card').forEach(card => {
        card.setAttribute('draggable', 'true');
        card.addEventListener('dragstart', onDragStart);
        card.addEventListener('dragend', onDragEnd);
    });

    document.querySelectorAll('.services-grid').forEach(grid => {
        grid.addEventListener('dragover', onGridDragOver);
        grid.addEventListener('dragleave', onGridDragLeave);
        grid.addEventListener('drop', onGridDrop);
    });
}

function onDragStart(e) {
    dragSrc = this;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => this.classList.add('dragging'), 0);
}

function onDragEnd() {
    if (dragSrc) dragSrc.classList.remove('dragging');
    document.querySelectorAll('.drag-placeholder').forEach(el => el.remove());
    dragSrc = null;
}

function onGridDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragSrc) return;

    const afterElement = getDragAfterElement(this, e.clientX, e.clientY);
    let placeholder = document.querySelector('.drag-placeholder');

    if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'drag-placeholder';
    }

    if (afterElement == null) {
        this.appendChild(placeholder);
    } else {
        this.insertBefore(placeholder, afterElement);
    }
}

function onGridDragLeave(e) {
    if (!this.contains(e.relatedTarget)) {
        document.querySelectorAll('.drag-placeholder').forEach(el => el.remove());
    }
}

function onGridDrop(e) {
    e.preventDefault();
    if (!dragSrc) return;

    const placeholder = document.querySelector('.drag-placeholder');
    const srcGrid = dragSrc.parentElement;
    const dstGrid = this;

    if (placeholder && placeholder.parentElement === dstGrid) {
        dstGrid.insertBefore(dragSrc, placeholder);
        placeholder.remove();
    } else {
        dstGrid.appendChild(dragSrc);
    }

    // Mudou de categoria — persiste via API
    if (srcGrid !== dstGrid) {
        const newCategory = dstGrid.closest('.category-section').querySelector('h2').textContent;
        updateServiceCategory(dragSrc.dataset.id, newCategory);
        if (srcGrid) saveDragOrder(srcGrid);
    }

    saveDragOrder(dstGrid);
}

function getDragAfterElement(grid, x, y) {
    const cards = [...grid.querySelectorAll('.service-card:not(.dragging)')];

    return cards.reduce((closest, card) => {
        const box = card.getBoundingClientRect();
        const centerX = box.left + box.width / 2;
        const centerY = box.top + box.height / 2;
        const sameRow = Math.abs(y - centerY) < box.height / 2;
        const before = y < centerY || (sameRow && x < centerX);

        if (before) {
            const dist = Math.hypot(x - centerX, y - centerY);
            if (dist < closest.dist) return { dist, element: card };
        }
        return closest;
    }, { dist: Infinity, element: null }).element;
}

async function updateServiceCategory(id, newCategory) {
    const service = services.find(s => s.id === id);
    if (!service) return;

    service.category = newCategory;

    try {
        if (service.isDocker) {
            await fetch(`/api/docker-override/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: newCategory })
            });
        } else {
            await fetch(`/api/services/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: newCategory })
            });
        }
    } catch (error) {
        console.error('Erro ao atualizar categoria:', error);
    }
}

function saveDragOrder(grid) {
    const category = grid.closest('.category-section').querySelector('h2').textContent;
    const order = Array.from(grid.querySelectorAll('.service-card')).map(c => c.dataset.id);
    const orders = JSON.parse(localStorage.getItem('serviceOrder') || '{}');
    orders[category] = order;
    localStorage.setItem('serviceOrder', JSON.stringify(orders));
}

function applyOrder(categoryServices, category) {
    const orders = JSON.parse(localStorage.getItem('serviceOrder') || '{}');
    const order = orders[category];
    if (!order) return categoryServices;

    return [...categoryServices].sort((a, b) => {
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });
}

// ============================================
// NOTIFICAÇÕES (polling + toasts)
// ============================================
function startPolling() {
    setInterval(checkForChanges, 30000);
}

async function checkForChanges() {
    try {
        const url = `/api/all-services${showHiddenContainers ? '?showHidden=true' : ''}`;
        const response = await fetch(url);
        const data = await response.json();

        const currentIds = new Set(data.services.filter(s => s.isDocker).map(s => s.id));
        const currentNames = new Map(data.services.filter(s => s.isDocker).map(s => [s.id, s.name]));

        if (previousContainerIds !== null) {
            let changed = false;

            previousContainerIds.forEach(id => {
                if (!currentIds.has(id)) {
                    showToast(`Container "${previousContainerNames.get(id) || id}" parou`, 'warning');
                    changed = true;
                }
            });

            currentIds.forEach(id => {
                if (!previousContainerIds.has(id)) {
                    showToast(`Container "${currentNames.get(id) || id}" iniciado`, 'success');
                    changed = true;
                }
            });

            if (changed) {
                services = data.services;
                categories = data.categories;
                hiddenCount = data.hiddenCount || 0;
                updateStats();
                renderServices();
                updateCategorySelect();
                updateHiddenButton();
            }
        }

        previousContainerIds = currentIds;
        previousContainerNames = currentNames;
    } catch (_) {
        // silent — sem conexão ou servidor reiniciando
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { warning: 'fa-triangle-exclamation', success: 'fa-circle-check', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${icons[type] || icons.info}"></i>
        <span>${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()" title="Fechar">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}