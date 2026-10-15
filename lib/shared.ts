export interface Doctor {
  id: string;
  name: string;
}

export interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  doctorName: string;
}
