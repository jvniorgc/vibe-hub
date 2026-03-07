const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST_IP = process.env.HOST_IP || 'localhost';

// Conectar ao Docker socket
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Arquivo para armazenar serviços manuais e categorias
const DATA_FILE = '/data/services.json';

// Função para ler dados salvos
function readData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Erro ao ler dados:', error);
    }
    return {
        services: [],
        categories: ['Containers', 'Media', 'Ferramentas', 'Monitoramento', 'Outros'],
        dockerOverrides: {}, // Overrides para containers Docker (porta, protocolo, etc.)
        hiddenContainers: [] // IDs de containers ocultos
    };
}

// Função para salvar dados
function saveData(data) {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
    }
}

// Portas web comuns (preferência)
const WEB_PORTS = [80, 443, 8080, 8443, 3000, 5000, 8000, 8888, 9000, 9090, 8081, 8082, 8083, 8084, 8085, 8086, 8686, 9696, 7878, 8989, 5030];

// Extrair porta exposta do container (preferir portas web)
function extractPort(container) {
    const ports = container.Ports || [];

    if (ports.length === 0) return null;

    // Primeiro, procurar por portas web conhecidas
    for (const port of ports) {
        if (port.PublicPort && WEB_PORTS.includes(port.PrivatePort)) {
            return port.PublicPort;
        }
    }

    // Se não encontrou porta web conhecida, pegar a primeira porta TCP mapeada
    for (const port of ports) {
        if (port.PublicPort && port.Type === 'tcp') {
            return port.PublicPort;
        }
    }

    // Fallback: qualquer porta pública
    for (const port of ports) {
        if (port.PublicPort) {
            return port.PublicPort;
        }
    }

    return null;
}

// Obter ícone baseado no nome do container
function getIconForContainer(name) {
    const iconMap = {
        'portainer': 'docker',
        'nginx': 'server',
        'traefik': 'route',
        'plex': 'play-circle',
        'jellyfin': 'film',
        'sonarr': 'tv',
        'radarr': 'video',
        'prowlarr': 'search',
        'lidarr': 'music',
        'bazarr': 'closed-captioning',
        'qbittorrent': 'download',
        'transmission': 'download',
        'slskd': 'music',
        'grafana': 'chart-line',
        'prometheus': 'fire',
        'pihole': 'shield-halved',
        'adguard': 'shield-halved',
        'homeassistant': 'house',
        'nextcloud': 'cloud',
        'postgres': 'database',
        'mysql': 'database',
        'mariadb': 'database',
        'mongo': 'database',
        'redis': 'memory',
        'adminer': 'table',
        'phpmyadmin': 'table',
        'code': 'code',
        'vscode': 'code',
        'gitea': 'code-branch',
        'gitlab': 'code-branch',
        'jenkins': 'gears',
        'watchtower': 'rotate',
        'uptime': 'heart-pulse',
        'homepage': 'house',
        'crafty': 'gamepad',
        'minecraft': 'gamepad'
    };

    const lowerName = name.toLowerCase();
    for (const [key, icon] of Object.entries(iconMap)) {
        if (lowerName.includes(key)) {
            return icon;
        }
    }
    return 'fa-cube';
}

// Categorizar container automaticamente
function categorizeContainer(name) {
    const categories = {
        'Media': ['plex', 'jellyfin', 'sonarr', 'radarr', 'prowlarr', 'lidarr', 'bazarr', 'overseerr', 'tautulli'],
        'Containers': ['portainer', 'watchtower', 'traefik', 'nginx-proxy'],
        'Monitoramento': ['grafana', 'prometheus', 'uptime', 'netdata', 'glances'],
        'Ferramentas': ['nextcloud', 'gitea', 'gitlab', 'jenkins', 'code', 'vscode', 'adminer', 'phpmyadmin'],
    };

    const lowerName = name.toLowerCase();
    for (const [category, keywords] of Object.entries(categories)) {
        for (const keyword of keywords) {
            if (lowerName.includes(keyword)) {
                return category;
            }
        }
    }
    return 'Outros';
}

// Função auxiliar para processar containers
function processContainer(container, overrides = {}) {
    const name = container.Names[0]?.replace('/', '') || 'unknown';
    const containerId = container.Id.substring(0, 12);
    const override = overrides[containerId] || overrides[name] || {};

    let port = override.port || extractPort(container);
    const protocol = override.protocol || 'http';
    const customIcon = override.icon;
    const customCategory = override.category;

    // Se não tem porta mas tem override, usar o override
    if (!port && override.port) {
        port = override.port;
    }

    return {
        id: containerId,
        name: name,
        image: container.Image,
        state: container.State,
        port: port,
        protocol: protocol,
        url: port ? `${protocol}://${HOST_IP}:${port}` : null,
        icon: customIcon || getIconForContainer(name),
        category: customCategory || categorizeContainer(name),
        isDocker: true,
        hasOverride: !!overrides[containerId] || !!overrides[name],
        needsConfig: !port // Flag para containers que precisam configurar porta
    };
}

// API: Listar containers Docker
app.get('/api/containers', async (req, res) => {
    try {
        const data = readData();
        const containers = await docker.listContainers({ all: false });
        const result = containers.map(container => processContainer(container, data.dockerOverrides));

        res.json(result);
    } catch (error) {
        console.error('Erro ao listar containers:', error);
        res.status(500).json({ error: 'Erro ao conectar ao Docker' });
    }
});

// API: Salvar override de container Docker
app.put('/api/docker-override/:id', (req, res) => {
    const data = readData();
    if (!data.dockerOverrides) data.dockerOverrides = {};

    data.dockerOverrides[req.params.id] = {
        ...data.dockerOverrides[req.params.id],
        ...req.body
    };

    saveData(data);
    res.json({ success: true, override: data.dockerOverrides[req.params.id] });
});

// API: Remover override de container Docker
app.delete('/api/docker-override/:id', (req, res) => {
    const data = readData();
    if (data.dockerOverrides) {
        delete data.dockerOverrides[req.params.id];
        saveData(data);
    }
    res.json({ success: true });
});

// API: Listar serviços manuais
app.get('/api/services', (req, res) => {
    const data = readData();
    res.json(data.services);
});

// API: Adicionar serviço manual
app.post('/api/services', (req, res) => {
    const data = readData();
    const service = {
        id: Date.now().toString(),
        ...req.body,
        isDocker: false
    };
    data.services.push(service);
    saveData(data);
    res.json(service);
});

// API: Atualizar serviço
app.put('/api/services/:id', (req, res) => {
    const data = readData();
    const index = data.services.findIndex(s => s.id === req.params.id);
    if (index !== -1) {
        data.services[index] = { ...data.services[index], ...req.body };
        saveData(data);
        res.json(data.services[index]);
    } else {
        res.status(404).json({ error: 'Serviço não encontrado' });
    }
});

// API: Deletar serviço
app.delete('/api/services/:id', (req, res) => {
    const data = readData();
    data.services = data.services.filter(s => s.id !== req.params.id);
    saveData(data);
    res.json({ success: true });
});

// API: Listar categorias
app.get('/api/categories', (req, res) => {
    const data = readData();
    res.json(data.categories);
});

// API: Adicionar categoria
app.post('/api/categories', (req, res) => {
    const data = readData();
    if (!data.categories.includes(req.body.name)) {
        data.categories.push(req.body.name);
        saveData(data);
    }
    res.json(data.categories);
});

// API: Deletar categoria
app.delete('/api/categories/:name', (req, res) => {
    const data = readData();
    data.categories = data.categories.filter(c => c !== req.params.name);
    saveData(data);
    res.json(data.categories);
});

// API: Todos os serviços (Docker + manuais)
app.get('/api/all-services', async (req, res) => {
    try {
        const data = readData();
        const showHidden = req.query.showHidden === 'true';
        const hiddenContainers = data.hiddenContainers || [];
        const containers = await docker.listContainers({ all: false });

        // Processar containers com overrides
        const dockerServices = containers.map(container => {
            const processed = processContainer(container, data.dockerOverrides || {});
            processed.isHidden = hiddenContainers.includes(processed.id) || hiddenContainers.includes(processed.name);
            return processed;
        });

        // Filtrar containers ocultos (a menos que showHidden seja true)
        const filteredDockerServices = showHidden
            ? dockerServices
            : dockerServices.filter(s => !s.isHidden);

        // Incluir todos os containers (mesmo sem porta, se tiver override ou para configurar)
        const allServices = [...filteredDockerServices, ...data.services];

        res.json({
            services: allServices,
            categories: data.categories,
            dockerOverrides: data.dockerOverrides || {},
            hiddenContainers: hiddenContainers,
            hiddenCount: dockerServices.filter(s => s.isHidden).length
        });
    } catch (error) {
        console.error('Erro:', error);
        const data = readData();
        res.json({
            services: data.services,
            categories: data.categories,
            dockerOverrides: data.dockerOverrides || {},
            hiddenContainers: data.hiddenContainers || [],
            hiddenCount: 0
        });
    }
});

// API: Ocultar container
app.post('/api/hide-container/:id', (req, res) => {
    const data = readData();
    if (!data.hiddenContainers) data.hiddenContainers = [];

    const containerId = req.params.id;
    if (!data.hiddenContainers.includes(containerId)) {
        data.hiddenContainers.push(containerId);
        saveData(data);
    }
    res.json({ success: true, hiddenContainers: data.hiddenContainers });
});

// API: Mostrar container (remover da lista de ocultos)
app.delete('/api/hide-container/:id', (req, res) => {
    const data = readData();
    if (data.hiddenContainers) {
        data.hiddenContainers = data.hiddenContainers.filter(id => id !== req.params.id);
        saveData(data);
    }
    res.json({ success: true, hiddenContainers: data.hiddenContainers || [] });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', hostIp: HOST_IP });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 HomeLab Dashboard rodando em http://0.0.0.0:${PORT}`);
    console.log(`📡 Host IP configurado: ${HOST_IP}`);
});

