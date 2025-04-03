# LifeVerse API

This API provides file upload and management functionality. It allows users to upload files, retrieve details about uploaded files, update metadata, and delete files. It is designed to handle file uploads with various file types, such as images (JPEG, PNG), PDFs, and text files. All uploaded files are stored in a local directory, and each file has metadata saved in a MongoDB database.

## Features

- **Single file upload** with validation for allowed file types and size limits.
- **CRUD operations** to manage uploads:
    - Create (upload files)
    - Read (fetch details of a file or all files)
    - Update (update file metadata)
    - Delete (remove files from the server and database)
- **File type validation** for JPEG, PNG, PDF, and text files.
- **File size limit** of 10 MB per file.
- **Logs** for tracking file upload errors and other events.

## Requirements

- Node.js (v14 or higher)
- MongoDB
- Express.js
- Multer (for handling file uploads)

## Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/LifeVerse-Development/API.git
    ```

2. Navigate to the project directory:

    ```bash
    cd API
    ```

3. Install dependencies:

    ```bash
    npm install
    ```

4. Configure environment variables (e.g., MongoDB connection string). You can create a `.env` file based on the `.env.example` provided.

5. Run the server:

    ```bash
    npm start
    ```

    The API should now be running on `http://localhost:3001`.

## API Endpoints

### 1. Upload a file

- **Endpoint**: `POST /uploads`
- **Description**: Uploads a single file to the server.
- **Request body**:

    - `file`: The file to be uploaded (form-data).
    - `userId`: The ID of the user uploading the file (optional, but recommended).

- **Response**:
    - `201 Created`: Success with file details.
    - `400 Bad Request`: If no file is uploaded or the file type is unsupported.

Example request (using Postman or curl):

```bash
POST http://localhost:3001/api/uploads
Content-Type: multipart/form-data

file: [your-file]
userId: 12345
```

### 2. Get all uploads

- **Endpoint**: `GET /uploads`
- **Description**: Retrieves a list of all uploaded files.
- **Response**:
    - `200 OK`: List of all uploaded files.

### 3. Get a specific upload

- **Endpoint**: `GET /uploads/:uploadId`
- **Description**: Retrieves details of a single uploaded file by its ID.
- **Response**:
    - `200 OK`: File details.
    - `404 Not Found`: If the file does not exist.

### 4. Delete an upload

- **Endpoint**: DELETE /uploads/:id
- **Description**: Deletes a specific uploaded file by its ID.
- **Response**:
    - `200 OK`: File deleted successfully.
    - `404 Not Found`: If the file does not exist.

### 5. Update an upload

- **Endpoint**: `PUT /uploads/:uploadId`
- **Description**: Updates metadata for a specific uploaded file.
- **Request body**:
    - `filename`: New filename (optional).
    - `fileType`: New file type (optional).
- **Response**:
    - `200 OK`: File metadata updated successfully.
    - `404 Not Found`: If the file does not exist.

## File Validation

- **Allowed File Types**:
    - `image/jpeg`
    - `image/png`
    - `application/pdf`
    - `text/plain`
- **Max File Size**: 10 MB.

## Error Handling

Errors are logged to the console and can be retrieved in the response. Here are some common error responses:

- `400 Bad Request`: Invalid file type, missing file, or file too large.
- `404 Not Found`: File not found in the database.
- `500 Internal Server Error`: General server error.

## Logs

All file upload operations and errors are logged using `winston` or a similar logging service. Logs are essential for debugging and monitoring the application.

## Database

The API uses MongoDB to store metadata about the uploaded files. Each file has the following fields:

- `identifier`: A unique identifier for each file.
- `userId`: The ID of the user who uploaded the file.
- `filename`: The name of the file.
- `filePath`: The path where the file is stored on the server.
- `fileType`: The MIME type of the file.
- `size`: The size of the file in bytes.

## Future Improvements

Implement file versioning. Support multiple file uploads in one request. Add file encryption for enhanced security. Integrate cloud storage providers (e.g., AWS S3, Google Cloud Storage).

## License

This project is licensed under the [MIT License](LICENSE) - see the LICENSE file for details.
