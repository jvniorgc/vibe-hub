// Estado da aplicação
let services = [];
let categories = [];
let hostIp = 'localhost';

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadServices();
    loadHostInfo();
});

// Carregar informações do host
async function loadHostInfo() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        hostIp = data.hostIp;
        document.getElementById('host-ip').textContent = hostIp;
    } catch (error) {
        console.error('Erro ao carregar info do host:', error);
    }
}

// Carregar todos os serviços
async function loadServices() {
    const container = document.getElementById('services-container');
    container.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Carregando serviços...</p>
        </div>
    `;

    try {
        const response = await fetch('/api/all-services');
        const data = await response.json();
        services = data.services;
        categories = data.categories;

        updateStats();
        renderServices();
        updateCategorySelect();
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

// Atualizar estatísticas
function updateStats() {
    const dockerCount = services.filter(s => s.isDocker).length;
    const manualCount = services.filter(s => !s.isDocker).length;
    
    document.getElementById('docker-count').textContent = dockerCount;
    document.getElementById('manual-count').textContent = manualCount;
    document.getElementById('category-count').textContent = categories.length;
}

// Renderizar serviços por categoria
function renderServices() {
    const container = document.getElementById('services-container');
    
    if (services.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>Nenhum serviço encontrado</h3>
                <p>Adicione um serviço manualmente ou inicie containers Docker.</p>
            </div>
        `;
        return;
    }

    // Agrupar por categoria
    const grouped = {};
    categories.forEach(cat => grouped[cat] = []);
    
    services.forEach(service => {
        const cat = service.category || 'Outros';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(service);
    });

    let html = '';
    for (const [category, categoryServices] of Object.entries(grouped)) {
        if (categoryServices.length === 0) continue;

        html += `
            <section class="category-section">
                <div class="category-header">
                    <i class="fa-solid fa-folder"></i>
                    <h2>${category}</h2>
                    <span class="badge">${categoryServices.length}</span>
                </div>
                <div class="services-grid">
                    ${categoryServices.map(service => renderServiceCard(service)).join('')}
                </div>
            </section>
        `;
    }

    container.innerHTML = html;
}

// Renderizar card de serviço
function renderServiceCard(service) {
    const color = service.color || '#00d9ff';
    // Corrigir ícone - adicionar prefixo se necessário
    let icon = service.icon || 'cube';
    if (!icon.startsWith('fa-')) {
        icon = 'fa-' + icon;
    }

    const protocol = service.protocol || 'http';
    const url = service.url || (service.port ? `${protocol}://${hostIp}:${service.port}` : null);

    // Se não tem URL, mostrar card para configurar
    if (!url) {
        return `
            <div class="service-card needs-config" style="--card-color: #f39c12">
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
                </div>
            </div>
        `;
    }

    return `
        <a href="${url}" target="_blank" class="service-card ${service.isDocker ? 'docker-service' : ''}"
           style="--card-color: ${color}">
            ${service.isDocker ? '<span class="service-badge"><i class="fa-brands fa-docker"></i> Docker</span>' : ''}
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

// Atualizar select de categorias
function updateCategorySelect() {
    const select = document.getElementById('service-category');
    select.innerHTML = categories.map(cat =>
        `<option value="${cat}">${cat}</option>`
    ).join('');
}

// ===== MODAL SERVIÇO =====
function openServiceModal() {
    document.getElementById('service-modal').classList.add('active');
    document.getElementById('modal-title').textContent = 'Adicionar Serviço';
    document.getElementById('service-form').reset();
    document.getElementById('service-id').value = '';
    document.getElementById('service-ip').placeholder = hostIp;
    document.getElementById('service-color').value = '#00d9ff';
    updateCategorySelect();
}

function closeServiceModal() {
    document.getElementById('service-modal').classList.remove('active');
}

async function saveService(event) {
    event.preventDefault();

    const id = document.getElementById('service-id').value;
    const ip = document.getElementById('service-ip').value || hostIp;
    const port = document.getElementById('service-port').value;
    const protocol = document.getElementById('service-protocol').value;

    const serviceData = {
        name: document.getElementById('service-name').value,
        port: parseInt(port),
        url: `${protocol}://${ip}:${port}`,
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

// ===== MODAL CATEGORIA =====
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

// Fechar modais ao clicar fora
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// Atalho de teclado para fechar modais
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    }
});

// ===== MODAL DOCKER OVERRIDE =====
function editDockerService(id, name) {
    const service = services.find(s => s.id === id);

    document.getElementById('docker-modal-title').textContent = `Configurar: ${name}`;
    document.getElementById('docker-id').value = id;
    document.getElementById('docker-name').value = name;
    document.getElementById('docker-port').value = service?.port || '';
    document.getElementById('docker-protocol').value = service?.protocol || 'http';
    document.getElementById('docker-category').value = service?.category || 'Outros';

    updateDockerCategorySelect();
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
    const overrideData = {
        port: parseInt(document.getElementById('docker-port').value) || null,
        protocol: document.getElementById('docker-protocol').value,
        category: document.getElementById('docker-category').value
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