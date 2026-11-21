import { AppMarker } from './AppMarker.js';
import { Callback } from './Callback.js';
import { ChangeRequest } from './ChangeRequest.js';
import { PaymentRun } from './PaymentRun.js';
import { Person } from './Person.js';
import { StaffRole } from './StaffRole.js';
import { Supplier } from './Supplier.js';

export type AppSchema = {
  Person: Person;
  AppMarker: AppMarker;
  Supplier: Supplier;
  ChangeRequest: ChangeRequest;
  Callback: Callback;
  PaymentRun: PaymentRun;
  StaffRole: StaffRole;
};

export const schema = [Person, AppMarker, Supplier, ChangeRequest, Callback, PaymentRun, StaffRole];
