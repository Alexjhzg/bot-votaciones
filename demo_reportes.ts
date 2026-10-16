import { 
  formatearTarjetaElector, 
  formatearConfirmacionVoto, 
  formatearAlertaYaVoto, 
  formatearReporteSEGEN, 
  formatearReporteINE, 
  formatearReporteCorteSEGEN, 
  formatearReporteCorteINE 
} from './src/utils/telegram.js';

// Estadísticas de prueba simulando el padrón real de SEGEN (210 electores, 5 cargos)
const statsSegen = {
  total: 210,
  votaron: 135,
  pendientes: 75,
  porcentaje: '64.29%',
  porCargo: {
    'VERIFICADOR/ENCUESTADOR INTEGRAL': { nombre: 'VERIFICADOR/ENCUESTADOR INTEGRAL', total: 94, votaron: 62, pendientes: 32, porcentaje: '65.96%' },
    'SUPERVISOR DE NODO': { nombre: 'SUPERVISOR DE NODO', total: 50, votaron: 30, pendientes: 20, porcentaje: '60.00%' },
    'COORDINADOR DE NODO': { nombre: 'COORDINADOR DE NODO', total: 49, votaron: 33, pendientes: 16, porcentaje: '67.35%' },
    'COORDINADOR MUNICIPAL': { nombre: 'COORDINADOR MUNICIPAL', total: 17, votaron: 10, pendientes: 7, porcentaje: '58.82%' }
  },
  porUnidad: {},
  porCorte: {
    '8:00 AM': 30,
    '10:00 AM': 45,
    '12:00 PM': 60
  },
  cedulasPorCorte: {}
};

// Estadísticas de prueba simulando el padrón real de INE (43 electores, 10 unidades)
const statsIne = {
  total: 43,
  votaron: 29,
  pendientes: 14,
  porcentaje: '67.44%',
  porCargo: {},
  porUnidad: {
    'Económica': { nombre: 'Económica', total: 8, votaron: 6, pendientes: 2, porcentaje: '75.00%' },
    'Sociales': { nombre: 'Sociales', total: 7, votaron: 5, pendientes: 2, porcentaje: '71.43%' },
    'SEEM': { nombre: 'SEEM', total: 7, votaron: 5, pendientes: 2, porcentaje: '71.43%' },
    'RRHH/Administración': { nombre: 'RRHH/Administración', total: 5, votaron: 4, pendientes: 1, porcentaje: '80.00%' },
    'Cartografía': { nombre: 'Cartografía', total: 4, votaron: 3, pendientes: 1, porcentaje: '75.00%' },
    'Demográfica': { nombre: 'Demográfica', total: 4, votaron: 2, pendientes: 2, porcentaje: '50.00%' },
    'SEGEN': { nombre: 'SEGEN', total: 3, votaron: 2, pendientes: 1, porcentaje: '66.67%' },
    'Control de Calidad': { nombre: 'Control de Calidad', total: 3, votaron: 1, pendientes: 2, porcentaje: '33.33%' },
    'Programas': { nombre: 'Programas', total: 1, votaron: 1, pendientes: 0, porcentaje: '100.00%' },
    'Gerencia': { nombre: 'Gerencia', total: 1, votaron: 0, pendientes: 1, porcentaje: '0.00%' }
  },
  porCorte: {
    '8:00 AM': 8,
    '10:00 AM': 11,
    '12:00 PM': 10
  },
  cedulasPorCorte: {
    '8:00 AM': ['11206771', '8979338', '11337533', '14205119', '18552140', '19342555', '20114223', '21554890'],
    '10:00 AM': ['12456789', '13554123', '15667890', '16778901', '17889012', '18990123', '20123456', '21234567', '22345678', '23456789', '24567890'],
    '12:00 PM': ['9876543', '10987654', '12112233', '13223344', '14334455', '15445566', '16556677', '17667788', '18778899', '19889900']
  }
};

console.log('----------------------------------------------------');
console.log('1. RESPUESTA AL REGISTRAR UN VOTO (ej: 27334492 voto listo)');
console.log('----------------------------------------------------');
console.log(formatearConfirmacionVoto({
  rowIndex: 2,
  cedula: '27334492',
  nombre: 'CARLOS MANUEL RODRIGUEZ',
  nomina: 'SEGEN',
  cargo: 'VERIFICADOR/ENCUESTADOR INTEGRAL',
  municipio: 'Maturin',
  parroquia: 'San Simon',
  haVotado: true,
  corte: '10:00 AM',
  fechaHoraVoto: '16/10/2026, 09:42:15 AM',
  reportadoPor: '@coordinador_juan'
}));

console.log('\n----------------------------------------------------');
console.log('2. RESPUESTA SI LA CÉDULA YA HABÍA SIDO REGISTRADA');
console.log('----------------------------------------------------');
console.log(formatearAlertaYaVoto({
  rowIndex: 2,
  cedula: '27334492',
  nombre: 'CARLOS MANUEL RODRIGUEZ',
  nomina: 'SEGEN',
  haVotado: true,
  corte: '10:00 AM'
}, '16/10/2026, 09:42:15 AM', '@coordinador_juan'));

console.log('\n----------------------------------------------------');
console.log('3. RESPUESTA AL CONSULTAR UNA CÉDULA (ej: 11206771)');
console.log('----------------------------------------------------');
console.log(formatearTarjetaElector({
  rowIndex: 5,
  cedula: '11206771',
  nombre: 'ANA MARIA PEREZ',
  nomina: 'INE',
  cargo: 'Analista de Estadísticas',
  unidad: 'Económica',
  centro: 'U.E. REPUBLICA DE VENEZUELA',
  mesa: '1',
  municipio: 'Maturin',
  haVotado: false
}));

console.log('\n----------------------------------------------------');
console.log('4. REPORTE MANUAL SEGEN: /segen (POR CARGOS Y TOTALIZACIÓN)');
console.log('----------------------------------------------------');
console.log(formatearReporteSEGEN(statsSegen as any, '12:00 PM'));

console.log('\n----------------------------------------------------');
console.log('5. REPORTE MANUAL INE: /ine (POR UNIDAD Y CÉDULAS POR CORTE)');
console.log('----------------------------------------------------');
console.log(formatearReporteINE(statsIne as any, '12:00 PM'));

console.log('\n----------------------------------------------------');
console.log('6. NOTIFICACIÓN AUTOMÁTICA DE CORTE: SEGEN (ej: 10:00 AM)');
console.log('----------------------------------------------------');
console.log(formatearReporteCorteSEGEN('10:00 AM', statsSegen as any));

console.log('\n----------------------------------------------------');
console.log('7. NOTIFICACIÓN AUTOMÁTICA DE CORTE: INE (ej: 10:00 AM)');
console.log('----------------------------------------------------');
console.log(formatearReporteCorteINE('10:00 AM', statsIne as any));
