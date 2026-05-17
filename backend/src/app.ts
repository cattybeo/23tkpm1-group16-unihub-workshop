import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/error-handler.ts';
import { verifyJwt, loadProfile, requireRole } from './middleware/auth.ts';
import { successResponse } from './shared/response-envelope.ts';
import catalogRouter from './modules/catalog/catalog-router.ts';
import registrationRouter from './modules/registration/registration-router.ts';
import paymentRouter from './modules/payment/payment-router.ts';
import checkinRouter from './modules/checkin/checkin-router.ts';
import summaryRouter from './modules/ai-summary/summary-router.ts';
import syncRouter from './modules/datasync/sync-router.ts';




const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/api/v1/workshops', catalogRouter);
app.use(errorHandler);
app.use('/api/v1/registrations', registrationRouter);
app.use('/api/v1/payments', paymentRouter);
app.use('/api/v1/check-ins', checkinRouter);
app.use('/api/v1/workshops', summaryRouter);
app.use('/api/v1/admin/csv-import', syncRouter); 


app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/v1/identity/me', 
  verifyJwt, 
  loadProfile, 
  (req, res) => {
    res.json(successResponse(req.user));
  }
);

app.get('/api/v1/admin/dashboard',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  (req, res) => {
    res.json(successResponse({ message: 'Chào mừng Ban tổ chức' }));
  }
);

app.use(errorHandler);

export default app;