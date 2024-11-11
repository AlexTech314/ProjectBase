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

-- Test changeSet 3: Drop the table
--changeset test_user:3
DROP TABLE test_table;

-- Test changeSet 4: Create a table
--changeset test_user:1
CREATE TABLE test_table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Test changeSet 5: Insert a sample record
--changeset test_user:2
INSERT INTO test_table (name) VALUES ('Test Record');

-- Test changeSet 6: Create a stored procedure to test the table
--changeset test_user:3
DELIMITER $$

CREATE PROCEDURE test_procedure()
BEGIN
    -- Describe the table
    DESCRIBE test_table;

    -- Show tables
    SHOW TABLES;

    -- Select data from the table
    SELECT * FROM test_table;
END $$

DELIMITER ;

-- Test changeSet 7: Call the stored procedure
--changeset test_user:4
CALL test_procedure();

-- Test changeSet 8: Drop the stored procedure
--changeset test_user:5
DROP PROCEDURE test_procedure;

-- Test changeSet 9: Drop the table
--changeset test_user:6
DROP TABLE test_table;