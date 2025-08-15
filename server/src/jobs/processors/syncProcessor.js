const { prisma, transaction } = require('../../utils/database');
const MarketplaceFactory = require('../../integrations/MarketplaceFactory');
const logger = require('../../utils/logger');

/**
 * Sync products to marketplace
 */
async function syncProducts(userId, marketplaceAccountId, productIds) {
  logger.info(`Starting product sync for user ${userId}, account ${marketplaceAccountId}`);
  
  try {
    // Get marketplace account with credentials
    const marketplaceAccount = await prisma.userMarketplaceAccount.findUnique({
      where: { id: marketplaceAccountId },
      include: {
        marketplace: true
      }
    });

    if (!marketplaceAccount || marketplaceAccount.userId !== userId) {
      throw new Error('Marketplace account not found or access denied');
    }

    if (!marketplaceAccount.isConnected) {
      throw new Error('Marketplace account is not connected');
    }

    // Get products to sync
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        userId,
        isActive: true
      },
      include: {
        category: true,
        variants: {
          where: { isActive: true }
        },
        inventory: true
      }
    });

    if (products.length === 0) {
      throw new Error('No products found to sync');
    }

    // Create marketplace integration
    const integration = MarketplaceFactory.createFromAccount(marketplaceAccount);

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        marketplaceAccountId,
        syncType: 'PRODUCTS',
        status: 'IN_PROGRESS',
        syncData: {
          productIds,
          totalProducts: products.length
        },
        startedAt: new Date()
      }
    });

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Sync each product
    for (const product of products) {
      try {
        // Check if product already exists in marketplace
        const existingMarketplaceProduct = await prisma.marketplaceProduct.findFirst({
          where: {
            productId: product.id,
            marketplaceAccountId
          }
        });

        let result;
        let action;

        if (existingMarketplaceProduct) {
          // Update existing product
          result = await integration.updateProduct(
            existingMarketplaceProduct.marketplaceProductId,
            product
          );
          action = 'updated';

          // Update marketplace product record
          await prisma.marketplaceProduct.update({
            where: { id: existingMarketplaceProduct.id },
            data: {
              syncStatus: 'SUCCESS',
              lastSynced: new Date(),
              marketplaceData: result
            }
          });
        } else {
          // Create new product
          result = await integration.createProduct(product);
          action = 'created';

          // Create marketplace product record
          await prisma.marketplaceProduct.create({
            data: {
              productId: product.id,
              marketplaceAccountId,
              marketplaceProductId: result.marketplaceProductId,
              syncStatus: 'SUCCESS',
              lastSynced: new Date(),
              marketplaceData: result.data
            }
          });
        }

        // Sync variants if any
        if (product.variants && product.variants.length > 0) {
          for (const variant of product.variants) {
            try {
              const existingVariantProduct = await prisma.marketplaceProduct.findFirst({
                where: {
                  productId: product.id,
                  variantId: variant.id,
                  marketplaceAccountId
                }
              });

              if (!existingVariantProduct && result.marketplaceProductId) {
                await prisma.marketplaceProduct.create({
                  data: {
                    productId: product.id,
                    variantId: variant.id,
                    marketplaceAccountId,
                    marketplaceProductId: result.marketplaceProductId,
                    syncStatus: 'SUCCESS',
                    lastSynced: new Date(),
                    marketplaceData: result.data
                  }
                });
              }
            } catch (variantError) {
              logger.warn(`Failed to sync variant ${variant.id}:`, variantError);
            }
          }
        }

        results.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          action,
          success: true,
          marketplaceProductId: result.marketplaceProductId
        });

        successCount++;
        logger.info(`Successfully ${action} product ${product.sku} in ${marketplaceAccount.marketplace.name}`);

      } catch (error) {
        // Mark as failed in marketplace product record
        const existingMarketplaceProduct = await prisma.marketplaceProduct.findFirst({
          where: {
            productId: product.id,
            marketplaceAccountId
          }
        });

        if (existingMarketplaceProduct) {
          await prisma.marketplaceProduct.update({
            where: { id: existingMarketplaceProduct.id },
            data: {
              syncStatus: 'FAILED',
              lastSynced: new Date()
            }
          });
        }

        results.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          action: 'failed',
          success: false,
          error: error.message
        });

        failureCount++;
        logger.error(`Failed to sync product ${product.sku}:`, error);
      }
    }

    // Update sync log
    const finalStatus = failureCount === 0 ? 'SUCCESS' : (successCount === 0 ? 'FAILED' : 'PARTIAL');
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        syncData: {
          ...syncLog.syncData,
          results,
          successCount,
          failureCount,
          totalProcessed: results.length
        }
      }
    });

    logger.info(`Product sync completed: ${successCount} success, ${failureCount} failed`);

    return {
      syncLogId: syncLog.id,
      status: finalStatus,
      successCount,
      failureCount,
      totalProcessed: results.length,
      results
    };

  } catch (error) {
    logger.error('Product sync failed:', error);
    throw error;
  }
}

/**
 * Sync orders from marketplace
 */
async function syncOrders(userId, marketplaceAccountId, dateRange) {
  logger.info(`Starting order sync for user ${userId}, account ${marketplaceAccountId}`);
  
  try {
    // Get marketplace account with credentials
    const marketplaceAccount = await prisma.userMarketplaceAccount.findUnique({
      where: { id: marketplaceAccountId },
      include: {
        marketplace: true
      }
    });

    if (!marketplaceAccount || marketplaceAccount.userId !== userId) {
      throw new Error('Marketplace account not found or access denied');
    }

    if (!marketplaceAccount.isConnected) {
      throw new Error('Marketplace account is not connected');
    }

    // Create marketplace integration
    const integration = MarketplaceFactory.createFromAccount(marketplaceAccount);

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        marketplaceAccountId,
        syncType: 'ORDERS',
        status: 'IN_PROGRESS',
        syncData: {
          dateRange
        },
        startedAt: new Date()
      }
    });

    const results = [];
    let successCount = 0;
    let failureCount = 0;
    let page = 1;
    let hasMore = true;

    // Fetch orders from marketplace
    while (hasMore) {
      try {
        const ordersResponse = await integration.getOrders({
          page,
          limit: 50,
          dateFrom: dateRange.startDate,
          dateTo: dateRange.endDate
        });

        const orders = ordersResponse.data || [];
        hasMore = ordersResponse.hasMore && orders.length > 0;

        for (const marketplaceOrder of orders) {
          try {
            // Check if order already exists
            const existingOrder = await prisma.order.findFirst({
              where: {
                marketplaceOrderId: marketplaceOrder.marketplaceOrderId,
                marketplaceAccountId
              }
            });

            if (existingOrder) {
              // Update existing order
              await prisma.order.update({
                where: { id: existingOrder.id },
                data: {
                  status: marketplaceOrder.status,
                  totalAmount: marketplaceOrder.totalAmount,
                  shippingCost: marketplaceOrder.shippingCost,
                  customerInfo: marketplaceOrder.customerInfo,
                  shippingAddress: marketplaceOrder.shippingAddress,
                  updatedAt: new Date()
                }
              });

              results.push({
                orderId: existingOrder.id,
                marketplaceOrderId: marketplaceOrder.marketplaceOrderId,
                action: 'updated',
                success: true
              });
            } else {
              // Create new order
              const newOrder = await transaction(async (tx) => {
                const order = await tx.order.create({
                  data: {
                    userId,
                    marketplaceAccountId,
                    orderNumber: `${marketplaceAccount.marketplace.code}-${marketplaceOrder.marketplaceOrderId}`,
                    marketplaceOrderId: marketplaceOrder.marketplaceOrderId,
                    status: marketplaceOrder.status,
                    totalAmount: marketplaceOrder.totalAmount,
                    shippingCost: marketplaceOrder.shippingCost,
                    customerInfo: marketplaceOrder.customerInfo,
                    shippingAddress: marketplaceOrder.shippingAddress,
                    orderDate: new Date(marketplaceOrder.orderDate)
                  }
                });

                // Create order items
                for (const item of marketplaceOrder.items) {
                  // Try to find matching product by SKU
                  const product = await tx.product.findFirst({
                    where: {
                      userId,
                      sku: item.sku
                    }
                  });

                  let variant = null;
                  if (product && item.variantId) {
                    variant = await tx.productVariant.findFirst({
                      where: {
                        productId: product.id,
                        sku: item.sku
                      }
                    });
                  }

                  await tx.orderItem.create({
                    data: {
                      orderId: order.id,
                      productId: product?.id,
                      variantId: variant?.id,
                      sku: item.sku,
                      productName: item.name,
                      quantity: item.quantity,
                      unitPrice: item.price,
                      totalPrice: item.totalPrice,
                      productData: item
                    }
                  });

                  // Update inventory if product found
                  if (product) {
                    const inventory = await tx.inventory.findFirst({
                      where: {
                        productId: product.id,
                        variantId: variant?.id
                      }
                    });

                    if (inventory) {
                      const newStock = Math.max(0, inventory.stockQuantity - item.quantity);
                      const newAvailable = Math.max(0, inventory.availableQuantity - item.quantity);

                      await tx.inventory.update({
                        where: { id: inventory.id },
                        data: {
                          stockQuantity: newStock,
                          availableQuantity: newAvailable
                        }
                      });

                      // Create stock movement
                      await tx.stockMovement.create({
                        data: {
                          productId: product.id,
                          variantId: variant?.id,
                          orderId: order.id,
                          userId,
                          movementType: 'OUT',
                          quantity: item.quantity,
                          stockBefore: inventory.stockQuantity,
                          stockAfter: newStock,
                          reason: `Order ${order.orderNumber}`
                        }
                      });
                    }
                  }
                }

                return order;
              });

              results.push({
                orderId: newOrder.id,
                marketplaceOrderId: marketplaceOrder.marketplaceOrderId,
                action: 'created',
                success: true
              });
            }

            successCount++;

          } catch (error) {
            results.push({
              marketplaceOrderId: marketplaceOrder.marketplaceOrderId,
              action: 'failed',
              success: false,
              error: error.message
            });

            failureCount++;
            logger.error(`Failed to sync order ${marketplaceOrder.marketplaceOrderId}:`, error);
          }
        }

        page++;
      } catch (error) {
        logger.error(`Failed to fetch orders page ${page}:`, error);
        break;
      }
    }

    // Update sync log
    const finalStatus = failureCount === 0 ? 'SUCCESS' : (successCount === 0 ? 'FAILED' : 'PARTIAL');
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        syncData: {
          ...syncLog.syncData,
          results,
          successCount,
          failureCount,
          totalProcessed: results.length
        }
      }
    });

    logger.info(`Order sync completed: ${successCount} success, ${failureCount} failed`);

    return {
      syncLogId: syncLog.id,
      status: finalStatus,
      successCount,
      failureCount,
      totalProcessed: results.length,
      results
    };

  } catch (error) {
    logger.error('Order sync failed:', error);
    throw error;
  }
}

/**
 * Sync inventory to marketplace
 */
async function syncInventory(userId, marketplaceAccountId, productIds) {
  logger.info(`Starting inventory sync for user ${userId}, account ${marketplaceAccountId}`);
  
  try {
    // Get marketplace account with credentials
    const marketplaceAccount = await prisma.userMarketplaceAccount.findUnique({
      where: { id: marketplaceAccountId },
      include: {
        marketplace: true
      }
    });

    if (!marketplaceAccount || marketplaceAccount.userId !== userId) {
      throw new Error('Marketplace account not found or access denied');
    }

    if (!marketplaceAccount.isConnected) {
      throw new Error('Marketplace account is not connected');
    }

    // Get inventory data
    const inventory = await prisma.inventory.findMany({
      where: {
        product: {
          id: { in: productIds },
          userId
        }
      },
      include: {
        product: true,
        variant: true
      }
    });

    if (inventory.length === 0) {
      throw new Error('No inventory found to sync');
    }

    // Create marketplace integration
    const integration = MarketplaceFactory.createFromAccount(marketplaceAccount);

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        marketplaceAccountId,
        syncType: 'INVENTORY',
        status: 'IN_PROGRESS',
        syncData: {
          productIds,
          totalItems: inventory.length
        },
        startedAt: new Date()
      }
    });

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Sync each inventory item
    for (const item of inventory) {
      try {
        // Get marketplace product ID
        const marketplaceProduct = await prisma.marketplaceProduct.findFirst({
          where: {
            productId: item.productId,
            variantId: item.variantId,
            marketplaceAccountId
          }
        });

        if (!marketplaceProduct) {
          throw new Error('Product not found in marketplace');
        }

        // Update stock in marketplace
        const result = await integration.updateStock(
          marketplaceProduct.marketplaceProductId,
          item.availableQuantity,
          item.variantId
        );

        // Update marketplace product record
        await prisma.marketplaceProduct.update({
          where: { id: marketplaceProduct.id },
          data: {
            syncStatus: 'SUCCESS',
            lastSynced: new Date()
          }
        });

        results.push({
          productId: item.productId,
          variantId: item.variantId,
          sku: item.variant?.sku || item.product.sku,
          oldStock: item.stockQuantity,
          newStock: item.availableQuantity,
          success: true
        });

        successCount++;

      } catch (error) {
        results.push({
          productId: item.productId,
          variantId: item.variantId,
          sku: item.variant?.sku || item.product.sku,
          success: false,
          error: error.message
        });

        failureCount++;
        logger.error(`Failed to sync inventory for product ${item.product.sku}:`, error);
      }
    }

    // Update sync log
    const finalStatus = failureCount === 0 ? 'SUCCESS' : (successCount === 0 ? 'FAILED' : 'PARTIAL');
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        syncData: {
          ...syncLog.syncData,
          results,
          successCount,
          failureCount,
          totalProcessed: results.length
        }
      }
    });

    logger.info(`Inventory sync completed: ${successCount} success, ${failureCount} failed`);

    return {
      syncLogId: syncLog.id,
      status: finalStatus,
      successCount,
      failureCount,
      totalProcessed: results.length,
      results
    };

  } catch (error) {
    logger.error('Inventory sync failed:', error);
    throw error;
  }
}

module.exports = {
  syncProducts,
  syncOrders,
  syncInventory
};
