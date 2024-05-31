import express from 'express';
import __dirname from './utils.js';
import handlebars from 'express-handlebars';
import viewsRouter from './routes/views.router.js';
import { Server } from 'socket.io';
import productsRouter from './routes/api/products.route.js'
import cartRouter from './routes//api/carts.route.js'
import realTimeProducts from './routes/api/realTimeProducts.router.js'
import chatRouter from './routes/api/message.router.js'
import mongoose from 'mongoose';
import productsModel from '../dao/models/products.model.js'
import chatModel from '../dao/models/chat.model.js';
import cartModel from '../dao/models/cart.model.js';
import Handlebars from 'handlebars';
import { allowInsecurePrototypeAccess } from '@handlebars/allow-prototype-access';
import sessionRouter from './routes/api/session.router.js';
import MongoStore from 'connect-mongo';
import session from 'express-session';  

const app = express();

const PORT = 3000;
const httpServer = app.listen(PORT, console.log(`Server is running on port ${PORT}`));
const socketServer = new Server(httpServer);

app.use(session({
    secret: 'secretkey',
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: 'mongodb+srv://ecommerce:1234@cluster0.yf8jzfb.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=Cluster0' }),
    // cookie: { maxAge: 180 * 60 * 1000 },
}));


mongoose.connect('mongodb+srv://ecommerce:1234@cluster0.yf8jzfb.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=Cluster0').then(
    () => {console.log('Conectado a la base de datos')}).catch(error => console.log("error en la conexion ", error))

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.engine('handlebars', handlebars.engine({
  handlebars: allowInsecurePrototypeAccess(Handlebars)
}));


app.set('views', __dirname + '/views');
app.set('view engine', 'handlebars');
app.use(express.static(__dirname + '/public'));
app.use('/api', productsRouter);
app.use('/api', cartRouter);
app.use('/chat', chatRouter)
app.use('/chat', chatRouter)
app.use("/realTimeProducts", realTimeProducts )
app.use('/api/session', sessionRouter);
app.use('/', viewsRouter);


let historialMensajes = await chatModel.find();
let usuarios = []
socketServer.on('connection', async socket => {
    console.log('Un cliente se ha conectado');
    // soket Chat
    socket.on('authenticate', (data) => {
      usuarios.push(socket); 
      
      socket.emit('messageLog', historialMensajes);
      console.log(historialMensajes)

      usuarios.forEach(client => {
          if (client !== socket) {
              client.emit('newUser', data);
          }
      });
    });

    socket.on('message', async (data) => {
      await chatModel.create({user: data.user, message: data.message});

      usuarios.forEach(client => {
          client.emit('message', data);
      });
  
    });


    // soket RealTimeProducts

    async function productosActualizados (){
      const productosActualizados = await productsModel.find() ;
      socketServer.emit('Lista-Modificada', productosActualizados);
    }

    const productos = await productsModel.find();
    socket.emit('Lista-Modificada', productos);

    // Cuando se elimina un producto
    socket.on ('eliminarProd', async (id) => {
        await cartModel.updateMany({ products: {_id : id}}, { $pull: { products: {_id : id} } });
        await productsModel.deleteOne({_id: id})
        productosActualizados();
    })
    // Cuando se agrega un producto
    socket.on('agregarProd', async (product) => {
        await productsModel.create({
            title: product.title, 
            description: product.description, 
            price: product.price, 
            code: product.code, 
            stock: product.stock, 
            status: product.status, 
            category: product.category});
        productosActualizados();
    })
  // Cuando se modifica un producto
    socket.on('modificarProd', async (product, id) => {
        await productsModel.updateOne({_id: id}, product)
        productosActualizados();
    });


    //socket agregar productos al carrito 
    socket.on  ('crearCarrito', async () => {
        let cart = await cartModel.create({});
        socket.emit('cartId', cart);

    })
    socket.on ('agregarProducto', async (productId, cartId) => {
        let producto = await productsModel.findOne({_id:productId});
        let carrito = await cartModel.findOne({_id:cartId});

        if (await cartModel.findOne({_id: cartId , products: {$elemMatch: {product:productId}}})){
            carrito.products.find(prod => prod.product.toString() === producto._id.toString()).quantity++;
        }else{
            carrito.products.push({product:productId , quantity: 1});
        }
        await cartModel.updateOne({_id:cartId}, carrito);
        socket.emit('productoAgregado', producto);
    })
    
})


