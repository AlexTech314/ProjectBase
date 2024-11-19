--liquibase formatted sql

-- Test changeSet 1: Create a table
--changeset test_user:1
CREATE TABLE test_table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Test changeSet 2: Insert a sample record
--changeset test_user:2
INSERT INTO test_table (name) VALUES ('Test Record');

-- Test changeSet 4: Drop the table
--changeset test_user:4
DROP TABLE test_table;