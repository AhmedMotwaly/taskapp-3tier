// ============================================
// TaskApp Frontend JavaScript - COMPLETE VERSION
// ============================================

let currentTasks = [];
let currentStats = {};

// ============================================
// Initialize Application
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 TaskApp initialized');
    
    // Only run dashboard functions if on dashboard page
    if (document.getElementById('tasksContainer')) {
        initializeDashboard();
    }
    
    // Check health on all pages
    checkHealth();
});

function initializeDashboard() {
    console.log('📊 Initializing dashboard...');
    
    // Load initial data
    loadTasks();
    loadStats();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize tooltips
    initializeTooltips();
}

// ============================================
// Event Listeners Setup
// ============================================

function setupEventListeners() {
    // Task form submission
    const taskForm = document.getElementById('taskForm');
    if (taskForm) {
        taskForm.addEventListener('submit', handleTaskSubmission);
    }
    
    // Filter changes
    const statusFilter = document.getElementById('statusFilter');
    const priorityFilter = document.getElementById('priorityFilter');
    const searchInput = document.getElementById('searchInput');
    
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }
    if (priorityFilter) {
        priorityFilter.addEventListener('change', applyFilters);
    }
    if (searchInput) {
        searchInput.addEventListener('input', debounce(applyFilters, 300));
    }
    
    // Modal events
    const taskModal = document.getElementById('taskModal');
    if (taskModal) {
        taskModal.addEventListener('show.bs.modal', resetTaskForm);
    }
}

// ============================================
// Initialize Bootstrap Tooltips
// ============================================

function initializeTooltips() {
    const tooltipTriggerList = [].slice.call(
        document.querySelectorAll('[data-bs-toggle="tooltip"]')
    );
    tooltipTriggerList.map(function(tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

// ============================================
// Health Check Functions
// ============================================

function checkHealth() {
    fetch('/health')
        .then(response => response.json())
        .then(data => {
            updateHealthStatus(data);
        })
        .catch(error => {
            console.error('❌ Health check failed:', error);
            updateHealthStatus({
                status: 'unhealthy',
                error: 'Connection failed',
                timestamp: new Date().toISOString()
            });
        });
}

function updateHealthStatus(data) {
    const statusElement = document.getElementById('health-status');
    if (!statusElement) return;
    
    statusElement.className = 'badge';
    
    if (data.status === 'healthy') {
        statusElement.className += ' health-healthy';
        statusElement.innerHTML = '<i class="fas fa-circle"></i> Healthy';
        console.log('✅ System healthy');
    } else {
        statusElement.className += ' health-unhealthy';
        statusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Unhealthy';
        console.log('❌ System unhealthy');
    }
    
    // Update tooltip
    statusElement.title = `Status: ${data.status}\nResponse Time: ${data.response_time_ms || 'N/A'}ms`;
}

// ============================================
// Statistics Functions
// ============================================

function loadStats() {
    fetch('/api/stats')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => {
            currentStats = data;
            displayStats(data);
            console.log('📊 Stats loaded:', data);
        })
        .catch(error => {
            console.error('❌ Error loading stats:', error);
            displayStatsError();
        });
}

function displayStats(stats) {
    // Update stat cards with animation
    updateStatCard('total-tasks', stats.total_tasks || 0);
    updateStatCard('completed-tasks', stats.status_counts?.completed || 0);
    updateStatCard('progress-tasks', stats.status_counts?.in_progress || 0);
    updateStatCard('overdue-tasks', stats.overdue_count || 0);
    
    // Update task count badge
    const taskCountElement = document.getElementById('task-count');
    if (taskCountElement) {
        const totalTasks = stats.total_tasks || 0;
        taskCountElement.textContent = `${totalTasks} task${totalTasks !== 1 ? 's' : ''}`;
    }
}

function updateStatCard(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        // Add animation class
        element.classList.add('updating');
        
        setTimeout(() => {
            element.textContent = value;
            element.classList.remove('updating');
        }, 150);
    }
}

function displayStatsError() {
    const statElements = ['total-tasks', 'completed-tasks', 'progress-tasks', 'overdue-tasks'];
    statElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = '?';
            element.title = 'Unable to load statistics';
        }
    });
}

// ============================================
// Task Management Functions
// ============================================

function loadTasks() {
    showLoadingSpinner(true);
    
    fetch('/api/tasks')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(tasks => {
            currentTasks = tasks;
            applyFilters();
            showLoadingSpinner(false);
            console.log(`✅ Loaded ${tasks.length} tasks`);
        })
        .catch(error => {
            console.error('❌ Error loading tasks:', error);
            displayTasksError(error.message);
            showLoadingSpinner(false);
        });
}

function displayTasks(tasks) {
    const container = document.getElementById('tasksContainer');
    if (!container) return;
    
    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-tasks fa-4x mb-3"></i>
                <h5>No tasks found</h5>
                <p class="text-muted">Create your first task to get started!</p>
                <button class="btn btn-primary mt-3" data-bs-toggle="modal" data-bs-target="#taskModal">
                    <i class="fas fa-plus me-2"></i>Create Task
                </button>
            </div>
        `;
        return;
    }
    
    const tasksHtml = tasks.map(task => createTaskCard(task)).join('');
    container.innerHTML = tasksHtml;
    
    // Add animation
    container.querySelectorAll('.task-card').forEach((card, index) => {
        card.style.animationDelay = `${index * 50}ms`;
        card.classList.add('slide-up');
    });
}

function createTaskCard(task) {
    const dueDate = task.due_date ? new Date(task.due_date) : null;
    const isOverdue = dueDate && dueDate < new Date() && task.status !== 'completed';
    const createdDate = new Date(task.created_at).toLocaleDateString();
    
    return `
        <div class="task-card priority-${task.priority} ${isOverdue ? 'border-danger' : ''}" data-task-id="${task.id}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div class="flex-grow-1">
                        <h6 class="card-title mb-1 ${task.status === 'completed' ? 'text-decoration-line-through text-muted' : ''}">
                            ${escapeHtml(task.title)}
                            ${isOverdue ? '<i class="fas fa-exclamation-triangle text-danger ms-2" title="Overdue"></i>' : ''}
                        </h6>
                        <p class="card-text text-muted small mb-2">
                            ${task.description ? escapeHtml(task.description) : '<em>No description</em>'}
                        </p>
                    </div>
                    <div class="btn-group-vertical ms-3">
                        <button class="btn btn-outline-primary btn-sm" 
                                onclick="updateTaskStatus(${task.id}, 'in_progress')"
                                ${task.status === 'in_progress' ? 'disabled' : ''}
                                title="Start Task">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="btn btn-outline-success btn-sm" 
                                onclick="updateTaskStatus(${task.id}, 'completed')"
                                ${task.status === 'completed' ? 'disabled' : ''}
                                title="Complete Task">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm" 
                                onclick="deleteTask(${task.id})"
                                title="Delete Task">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                
                <div class="d-flex flex-wrap gap-2 align-items-center">
                    <span class="badge bg-${getStatusColor(task.status)} status-badge">
                        ${formatStatus(task.status)}
                    </span>
                    <span class="badge priority-${task.priority} bg-light text-dark">
                        ${task.priority}
                    </span>
                    ${dueDate ? `
                        <span class="badge ${isOverdue ? 'bg-danger' : 'bg-info'} text-white">
                            <i class="fas fa-calendar me-1"></i>${dueDate.toLocaleDateString()}
                        </span>
                    ` : ''}
                </div>
                
                <div class="mt-2 d-flex justify-content-between align-items-center">
                    <small class="text-muted">
                        <i class="fas fa-user me-1"></i>${escapeHtml(task.first_name || task.username)}
                        <i class="fas fa-clock ms-2 me-1"></i>${createdDate}
                    </small>
                </div>
            </div>
        </div>
    `;
}

function getStatusColor(status) {
    const colors = {
        'pending': 'secondary',
        'in_progress': 'primary',
        'completed': 'success',
        'cancelled': 'dark'
    };
    return colors[status] || 'secondary';
}

function formatStatus(status) {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Task CRUD Operations
// ============================================

function handleTaskSubmission(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const taskData = {
        title: formData.get('title').trim(),
        description: formData.get('description').trim(),
        priority: formData.get('priority'),
        due_date: formData.get('due_date') || null
    };
    
    if (!taskData.title) {
        showAlert('Task title is required', 'danger');
        return;
    }
    
    createTask(taskData);
}

function createTask(taskData) {
    const submitButton = document.querySelector('#taskForm button[type="submit"]');
    const originalText = submitButton.innerHTML;
    
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Creating...';
    
    fetch('/api/tasks', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(taskData)
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then(data => {
        showAlert(`Task "${data.title}" created successfully!`, 'success');
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('taskModal'));
        modal.hide();
        
        // Refresh data
        loadTasks();
        loadStats();
        
        console.log('✅ Task created:', data);
    })
    .catch(error => {
        console.error('❌ Error creating task:', error);
        showAlert('Error creating task. Please try again.', 'danger');
    })
    .finally(() => {
        submitButton.disabled = false;
        submitButton.innerHTML = originalText;
    });
}

function updateTaskStatus(taskId, status) {
    fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: status })
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then(data => {
        showAlert('Task updated successfully!', 'success');
        loadTasks();
        loadStats();
        console.log('✅ Task updated:', taskId);
    })
    .catch(error => {
        console.error('❌ Error updating task:', error);
        showAlert('Error updating task. Please try again.', 'danger');
    });
}

function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
        return;
    }
    
    fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then(data => {
        showAlert('Task deleted successfully!', 'success');
        loadTasks();
        loadStats();
        console.log('✅ Task deleted:', taskId);
    })
    .catch(error => {
        console.error('❌ Error deleting task:', error);
        showAlert('Error deleting task. Please try again.', 'danger');
    });
}

// ============================================
// Filter and Search Functions
// ============================================

function applyFilters() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    const priorityFilter = document.getElementById('priorityFilter')?.value || 'all';
    
    let filteredTasks = currentTasks.filter(task => {
        const matchesSearch = !searchTerm ||
            task.title.toLowerCase().includes(searchTerm) ||
            (task.description && task.description.toLowerCase().includes(searchTerm));
        
        const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
        const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
        
        return matchesSearch && matchesStatus && matchesPriority;
    });
    
    displayTasks(filteredTasks);
    
    // Update task count
    const taskCountElement = document.getElementById('task-count');
    if (taskCountElement) {
        const count = filteredTasks.length;
        taskCountElement.textContent = `${count} task${count !== 1 ? 's' : ''}`;
    }
}

function resetFilters() {
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('priorityFilter').value = 'all';
    document.getElementById('searchInput').value = '';
    applyFilters();
}

// ============================================
// Utility Functions
// ============================================

function showLoadingSpinner(show) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        spinner.classList.toggle('d-none', !show);
    }
}

function showAlert(message, type = 'info', duration = 5000) {
    const alertContainer = document.createElement('div');
    alertContainer.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertContainer.style.cssText = 'top: 80px; right: 20px; z-index: 9999; min-width: 300px; max-width: 500px;';
    
    const icon = type === 'success' ? 'check-circle' : type === 'danger' ? 'exclamation-circle' : 'info-circle';
    
    alertContainer.innerHTML = `
        <i class="fas fa-${icon} me-2"></i>${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertContainer);
    
    // Auto-remove
    setTimeout(() => {
        if (alertContainer.parentNode) {
            alertContainer.classList.remove('show');
            setTimeout(() => alertContainer.remove(), 150);
        }
    }, duration);
}

function resetTaskForm() {
    const form = document.getElementById('taskForm');
    if (form) {
        form.reset();
        document.getElementById('taskModalLabel').innerHTML = 
            '<i class="fas fa-plus me-2"></i>Create New Task';
    }
}

function refreshAllData() {
    showAlert('Refreshing data...', 'info', 2000);
    loadTasks();
    loadStats();
    checkHealth();
    console.log('🔄 Refreshing all data');
}

function displayTasksError(message) {
    const container = document.getElementById('tasksContainer');
    if (container) {
        container.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Error loading tasks:</strong> ${message}
                <br>
                <button class="btn btn-outline-danger btn-sm mt-2" onclick="loadTasks()">
                    <i class="fas fa-redo me-1"></i>Try Again
                </button>
            </div>
        `;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
// Add CSS animation for updating stats
// ============================================

const style = document.createElement('style');
style.textContent = `
    .updating {
        animation: pulse 0.3s ease-in-out;
    }
    
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); color: var(--bs-primary); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(style);

console.log('✅ TaskApp JavaScript loaded successfully');