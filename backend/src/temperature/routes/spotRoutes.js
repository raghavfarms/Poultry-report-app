import express from 'express'
import { getSpots,
        createSpot,
        quickSetupSpots,
        deleteSpot,
        updateSpot,
        toggleSpotStatus
 } from '../controllers/spotController.js'

  const router=express.Router();

//  Route for getting all spots & creating a single spot 

router.route('/')
      .get(getSpots)
      .post(createSpot);

      // Route for 1-click auto-setup of Sheds 1 to 4
router.post('/quick-setup',quickSetupSpots);

// Route for deleting a spot by its MongoDB _id
  router.route('/:id')
  .put(updateSpot)
  .delete(deleteSpot);



// Route for toggling active/inactive status (PATCH)
router.patch('/:id/toggle-status', toggleSpotStatus);

export default router;


