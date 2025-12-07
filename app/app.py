from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
import mysql.connector
from mysql.connector import pooling
import os
from datetime import datetime
import bcrypt
import logging
from functools import wraps
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'dev-secret-key-change-this')

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'pool_name': 'taskapp_pool',
    'pool_size': 5,
    'pool_reset_session': True,
    'charset': 'utf8mb4',
    'use_unicode': True,
    'autocommit': True
}

# Initialize connection pool
try:
    db_pool = pooling.MySQLConnectionPool(**DB_CONFIG)
    logger.info("✅ Database connection pool created successfully")
except Exception as e:
    logger.error(f"❌ Failed to create database pool: {e}")
    db_pool = None


def get_db_connection():
    """Get database connection from pool"""
    try:
        if db_pool:
            return db_pool.get_connection()
        else:
            logger.error("Connection pool not available")
            return None
    except mysql.connector.Error as err:
        logger.error(f"Database connection error: {err}")
        return None


def login_required(f):
    """Decorator to require login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in to access this page', 'warning')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


# ============= ROUTES =============

@app.route('/')
def index():
    """Landing page"""
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('index.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    """User login"""
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        if not username or not password:
            flash('Please enter both username and password', 'error')
            return render_template('login.html')
        
        try:
            conn = get_db_connection()
            if not conn:
                flash('Database connection error', 'error')
                return render_template('login.html')
            
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                "SELECT id, username, password_hash, first_name FROM users WHERE username = %s",
                (username,)
            )
            user = cursor.fetchone()
            cursor.close()
            conn.close()
            
            # For demo purposes, we'll check the password hash
            # Password for 'demo_user' is 'demo123'
            if user and bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
                session['user_id'] = user['id']
                session['username'] = user['username']
                session['first_name'] = user['first_name']
                flash(f'Welcome back, {user["first_name"]}!', 'success')
                logger.info(f"✅ User {username} logged in successfully")
                return redirect(url_for('dashboard'))
            else:
                flash('Invalid username or password', 'error')
                logger.warning(f"❌ Failed login attempt for {username}")
                
        except Exception as e:
            logger.error(f"Login error: {e}")
            flash('An error occurred during login', 'error')
    
    return render_template('login.html')


@app.route('/logout')
def logout():
    """User logout"""
    username = session.get('username', 'Unknown')
    session.clear()
    flash('You have been logged out successfully', 'info')
    logger.info(f"User {username} logged out")
    return redirect(url_for('index'))


@app.route('/dashboard')
@login_required
def dashboard():
    """Main dashboard"""
    return render_template('dashboard.html', username=session.get('username'))


@app.route('/health')
def health_check():
    """Health check endpoint for load balancer"""
    import time
    start_time = time.time()
    
    health_data = {
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0'
    }
    
    # Check database connectivity
    try:
        conn = get_db_connection()
        if conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            cursor.close()
            conn.close()
            health_data['database'] = 'connected'
        else:
            health_data['database'] = 'disconnected'
            health_data['status'] = 'unhealthy'
    except Exception as e:
        health_data['database'] = f'error: {str(e)}'
        health_data['status'] = 'unhealthy'
    
    response_time = (time.time() - start_time) * 1000
    health_data['response_time_ms'] = round(response_time, 2)
    
    status_code = 200 if health_data['status'] == 'healthy' else 503
    return jsonify(health_data), status_code


# ============= API ROUTES =============

@app.route('/api/tasks', methods=['GET'])
@login_required
def get_tasks():
    """Get all tasks for current user"""
    user_id = session['user_id']
    
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT 
                t.id, t.title, t.description, t.status, t.priority, t.due_date,
                t.created_at, t.updated_at,
                u.username, u.first_name, u.last_name
            FROM tasks t
            JOIN users u ON t.user_id = u.id
            WHERE t.user_id = %s
            ORDER BY t.updated_at DESC
        """, (user_id,))
        
        tasks = cursor.fetchall()
        
        # Convert datetime to string for JSON
        for task in tasks:
            if task['created_at']:
                task['created_at'] = task['created_at'].isoformat()
            if task['updated_at']:
                task['updated_at'] = task['updated_at'].isoformat()
            if task['due_date']:
                task['due_date'] = task['due_date'].isoformat()
        
        cursor.close()
        conn.close()
        
        logger.info(f"Retrieved {len(tasks)} tasks for user {user_id}")
        return jsonify(tasks)
        
    except Exception as e:
        logger.error(f"Error retrieving tasks: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks', methods=['POST'])
@login_required
def create_task():
    """Create new task"""
    user_id = session['user_id']
    data = request.get_json()
    
    if not data or not data.get('title'):
        return jsonify({'error': 'Title is required'}), 400
    
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO tasks (user_id, title, description, priority, due_date)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            user_id,
            data['title'],
            data.get('description', ''),
            data.get('priority', 'medium'),
            data.get('due_date') if data.get('due_date') else None
        ))
        
        task_id = cursor.lastrowid
        cursor.close()
        conn.close()
        
        logger.info(f"✅ Created task {task_id}: {data['title']}")
        return jsonify({
            'id': task_id,
            'message': 'Task created successfully',
            'title': data['title']
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating task: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
@login_required
def update_task(task_id):
    """Update existing task"""
    user_id = session['user_id']
    data = request.get_json()
    
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor()
        
        # Verify task belongs to user
        cursor.execute(
            "SELECT id FROM tasks WHERE id = %s AND user_id = %s",
            (task_id, user_id)
        )
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({'error': 'Task not found'}), 404
        
        # Build update query
        update_fields = []
        values = []
        
        if 'title' in data:
            update_fields.append('title = %s')
            values.append(data['title'])
        if 'description' in data:
            update_fields.append('description = %s')
            values.append(data['description'])
        if 'status' in data:
            update_fields.append('status = %s')
            values.append(data['status'])
        if 'priority' in data:
            update_fields.append('priority = %s')
            values.append(data['priority'])
        if 'due_date' in data:
            update_fields.append('due_date = %s')
            values.append(data['due_date'] if data['due_date'] else None)
        
        if update_fields:
            values.append(task_id)
            query = f"UPDATE tasks SET {', '.join(update_fields)} WHERE id = %s"
            cursor.execute(query, values)
        
        cursor.close()
        conn.close()
        
        logger.info(f"✅ Updated task {task_id}")
        return jsonify({'message': 'Task updated successfully'})
        
    except Exception as e:
        logger.error(f"Error updating task: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    """Delete task"""
    user_id = session['user_id']
    
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM tasks WHERE id = %s AND user_id = %s",
            (task_id, user_id)
        )
        
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Task not found'}), 404
        
        cursor.close()
        conn.close()
        
        logger.info(f"✅ Deleted task {task_id}")
        return jsonify({'message': 'Task deleted successfully'})
        
    except Exception as e:
        logger.error(f"Error deleting task: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    """Get task statistics"""
    user_id = session['user_id']
    
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(dictionary=True)
        
        # Status counts
        cursor.execute("""
            SELECT status, COUNT(*) as count
            FROM tasks
            WHERE user_id = %s
            GROUP BY status
        """, (user_id,))
        status_counts = {row['status']: row['count'] for row in cursor.fetchall()}
        
        # Priority counts
        cursor.execute("""
            SELECT priority, COUNT(*) as count
            FROM tasks
            WHERE user_id = %s
            GROUP BY priority
        """, (user_id,))
        priority_counts = {row['priority']: row['count'] for row in cursor.fetchall()}
        
        # Overdue count
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM tasks
            WHERE user_id = %s
            AND due_date < CURDATE()
            AND status != 'completed'
        """, (user_id,))
        overdue_count = cursor.fetchone()['count']
        
        cursor.close()
        conn.close()
        
        stats = {
            'status_counts': status_counts,
            'priority_counts': priority_counts,
            'overdue_count': overdue_count,
            'total_tasks': sum(status_counts.values())
        }
        
        return jsonify(stats)
        
    except Exception as e:
        logger.error(f"Error retrieving stats: {e}")
        return jsonify({'error': str(e)}), 500


# ============= ERROR HANDLERS =============

@app.errorhandler(404)
def not_found(error):
    """404 error handler"""
    return render_template('404.html'), 404


@app.errorhandler(500)
def internal_error(error):
    """500 error handler"""
    logger.error(f"Internal error: {error}")
    return render_template('500.html'), 500


# ============= RUN APPLICATION =============

if __name__ == '__main__':
    logger.info("🚀 Starting TaskApp...")
    logger.info(f"📊 Database: {DB_CONFIG.get('host', 'Not configured')}")
    app.run(host='0.0.0.0', port=5000, debug=True)