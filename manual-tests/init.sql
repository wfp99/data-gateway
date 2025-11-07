-- 初始化測試資料庫架構

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    age INT,
    status VARCHAR(50) DEFAULT 'active',
    department VARCHAR(100),
    salary DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    INDEX idx_status (status),
    INDEX idx_email (email),
    INDEX idx_department (department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    views INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_post_id (post_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入測試資料
INSERT INTO users (name, email, age, status, department, salary) VALUES
    ('Alice Chen', 'alice@example.com', 28, 'active', 'Engineering', 75000.00),
    ('Bob Wang', 'bob@example.com', 35, 'active', 'Engineering', 95000.00),
    ('Charlie Lin', 'charlie@example.com', 42, 'active', 'Product', 85000.00),
    ('Diana Liu', 'diana@example.com', 31, 'active', 'Design', 70000.00),
    ('Eve Zhang', 'eve@example.com', 26, 'inactive', 'Engineering', 65000.00),
    ('Frank Wu', 'frank@example.com', 45, 'active', 'Product', 120000.00),
    ('Grace Huang', 'grace@example.com', 29, 'active', 'Design', 72000.00),
    ('Henry Lee', 'henry@example.com', 38, 'active', 'Engineering', 88000.00),
    ('Ivy Chen', 'ivy@example.com', 33, 'inactive', 'Product', 78000.00),
    ('Jack Yang', 'jack@example.com', 27, 'active', 'Engineering', 68000.00);

INSERT INTO posts (user_id, title, content, status, views) VALUES
    (1, 'Introduction to TypeScript', 'TypeScript is a typed superset of JavaScript...', 'published', 1250),
    (1, 'Node.js Best Practices', 'Here are some best practices for Node.js development...', 'published', 890),
    (2, 'Database Design Patterns', 'Common patterns in database design...', 'published', 2100),
    (3, 'Product Management 101', 'Essential skills for product managers...', 'published', 750),
    (4, 'UI/UX Design Principles', 'Core principles of good design...', 'published', 1560),
    (5, 'My Journey in Tech', 'Starting my career in technology...', 'draft', 0),
    (6, 'Scaling Microservices', 'How to scale microservices architecture...', 'published', 3200),
    (8, 'Code Review Guidelines', 'Best practices for code reviews...', 'published', 920),
    (10, 'Learning Resources', 'Great resources for learning programming...', 'draft', 0);

INSERT INTO comments (post_id, user_id, content) VALUES
    (1, 2, 'Great introduction! Very helpful.'),
    (1, 3, 'I learned a lot from this article.'),
    (1, 8, 'Could you add more examples?'),
    (2, 4, 'These practices are really useful.'),
    (3, 1, 'Excellent explanation of the patterns.'),
    (3, 6, 'Very comprehensive guide.'),
    (4, 7, 'This helped me understand PM better.'),
    (5, 2, 'Beautiful examples!'),
    (5, 8, 'The color theory section is perfect.'),
    (7, 1, 'This is exactly what I needed for my project.'),
    (7, 3, 'Amazing depth of knowledge.'),
    (8, 10, 'Thanks for sharing these guidelines.');
