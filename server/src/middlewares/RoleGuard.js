export const RoleGuard = (roles)=>{
    return (req,res,next)=>{
        if(!roles.includes(req.user.role)){
            return res.status(403).json({message:"Unauthorized"})
        }
        next()
    }
}