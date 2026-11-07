import { User } from 'users/users.entity';
import { File as MulterFile } from 'multer';
declare global {
  namespace Express {
    interface Request {
      user?: User; // Add the user property with the appropriate type
    }
    interface Multer {
      File: MulterFile;
    }
  }
}
